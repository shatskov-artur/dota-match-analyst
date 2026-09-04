import { useEffect, useMemo } from 'react'
import { buildingDecoder } from '@shared/buildingDecoder'
import { useMatchDetail } from './useMatchDetail'
import { useMatchTimeline, useSnapshotAt, type TimelineResponse } from './useArchive'
import { useTimelineCursor, isScrubbing, PLAYBACK_MS } from '../store/timelineCursor'
import { IS_DEMO } from '../lib/apiFetch'
import type { EnrichedGame, PlayerDetail } from './useLiveGames'

/**
 * One source of truth for "what does this match look like right now on screen".
 *
 * Resolution order:
 *   cursor is a minute  → the archived snapshot at that minute
 *   cursor is 'live'    → the live payload; if the match is not live any more, the last
 *                         archived snapshot, so a finished match still renders
 *
 * Both branches return the same shape, because /api/matches/:id/at replays the exact
 * payload the BFF served at that moment. That equivalence is the whole reason MatchPage
 * needed no component changes to gain time travel.
 */

export interface MatchView {
  match: EnrichedGame | undefined
  radiantPlayers: PlayerDetail[]
  direPlayers: PlayerDetail[]
  buildings: ReturnType<typeof buildingDecoder>
  history: Array<{ t: number; gold: number; xp: number }>
  isLoading: boolean
  gameState: number | undefined
  /** Whether the screen is showing the past. */
  scrubbing: boolean
  /** Where the scrubber can go: 0..lastMinute. */
  lastMinute: number | null
  /** Minute currently rendered (live view reports the live clock). */
  currentMinute: number | null
  timeline: TimelineResponse | undefined
  /** True when the match is no longer in Valve's live feed. */
  isArchivedOnly: boolean
  /**
   * The archive had no recording of the minute that was asked for, so a neighbouring one
   * is on screen. Covers BOTH directions — before the first snapshot and after the last,
   * the second being the common case on a live match whose recorder trails the game clock.
   * The server's own `exact` flag only ever reported the first.
   */
  inexact: boolean
  /** The minute actually rendered, which is not always the one requested. */
  shownMinute: number | null
  /**
   * Whether this match can be put on screen minute by minute at all.
   *
   * /api/matches/:id/at answers for anything the archive holds — from a live recording, or
   * rebuilt from the parsed replay — so this is normally true. It goes false when that
   * endpoint has actually answered that it holds nothing, which is the state the demo
   * build's export produces for the matches it captured a timeline but no per-minute state
   * for. Without it the scrubber renders over a match it cannot move, which reads as a
   * broken control rather than as an absent recording.
   */
  timeTravel: boolean
  /**
   * The minute on screen was rebuilt from per-minute rows rather than replayed from a
   * live snapshot, so the item, cooldown and map panels have nothing to draw.
   */
  reconstructed: boolean
  /** Item slots on screen are the final build, not this minute's inventory. */
  itemsAreFinal: boolean
  /** Assists are filled — only true at a reconstructed match's final minute. */
  assistsKnown: boolean
  /**
   * Every source has answered and none of them has this match: not the live feed, not the
   * archive. A permanent state — the id is wrong, or the game was never recorded.
   */
  notFound: boolean
  /**
   * Demo build only, and the opposite of permanent: the replay cursor is standing at a
   * point in the recording where this match had not started (or had already been dropped
   * from the capture). Moving the scrubber forward brings it back.
   */
  notInRecording: boolean
}

/** Shared derivation so live and archived views cannot drift apart. */
export function deriveFromGame(match: EnrichedGame | undefined): Pick<MatchView, 'radiantPlayers' | 'direPlayers' | 'buildings'> {
  return {
    // team 0 = Radiant, team 1 = Dire. 2 (broadcaster) and 4 (unassigned) are excluded.
    radiantPlayers: match?.players?.filter((p) => p.team === 0) ?? [],
    direPlayers: match?.players?.filter((p) => p.team === 1) ?? [],
    // CRITICAL: tower_state, not building_state. The BFF packs the two per-team masks
    // into the layout buildingDecoder expects (liveAggregator.ts).
    buildings: buildingDecoder(match?.tower_state, match?.barracks_state),
  }
}

export function useMatchState(matchId: string | undefined): MatchView {
  const cursorMinute = useTimelineCursor((s) => s.minute)
  const playing = useTimelineCursor((s) => s.playing)
  const setMinute = useTimelineCursor((s) => s.setMinute)
  const setPlaying = useTimelineCursor((s) => s.setPlaying)
  const bindMatch = useTimelineCursor((s) => s.bindMatch)

  // Switching maps within a series must not carry the previous map's minute across.
  useEffect(() => {
    bindMatch(matchId ?? null)
  }, [matchId, bindMatch])

  const scrubbing = isScrubbing(cursorMinute)

  // A finished match is legitimately absent from the live feed but fully present in the
  // archive, so "not in the feed" is only ever half an answer. It is reported as a flag and
  // resolved below, once the archive has spoken too.
  const live = useMatchDetail(matchId, { paused: scrubbing })
  const isLiveMatch = live.match !== undefined && live.match.game_state !== 6
  const timelineQuery = useMatchTimeline(matchId, isLiveMatch)
  const timeline = timelineQuery.data

  const lastMinute = timeline?.lastMinute ?? null

  // 'live' on a finished match resolves to the final stored minute rather than nothing.
  const requestedMinute = scrubbing ? cursorMinute : live.match ? null : lastMinute
  const snapshot = useSnapshotAt(matchId, requestedMinute)

  // Auto-advance. Stops at the end instead of wrapping — reaching the last minute of a
  // finished match is the end of the story, not a loop.
  useEffect(() => {
    if (!playing || !scrubbing || lastMinute === null) return
    const id = setInterval(() => {
      const current = useTimelineCursor.getState().minute
      if (typeof current !== 'number') return
      if (current >= lastMinute) {
        setPlaying(false)
        return
      }
      setMinute(current + 1)
    }, PLAYBACK_MS)
    return () => clearInterval(id)
  }, [playing, scrubbing, lastMinute, setMinute, setPlaying])

  const match = scrubbing || !live.match ? snapshot.data?.game : live.match

  const derived = useMemo(() => deriveFromGame(match), [match])

  /**
   * Prefer the archive's per-minute rows over the payload's embedded `history`: the
   * latter is the Redis series, capped at 240 points with a 2h TTL, so it cannot cover
   * a whole match and is empty entirely for anything finished.
   */
  const history = useMemo(() => {
    const fromArchive = (timeline?.timeline ?? [])
      .filter((r) => r.radiantGoldAdv !== null || r.radiantXpAdv !== null)
      .map((r) => ({ t: r.minute * 60, gold: r.radiantGoldAdv ?? 0, xp: r.radiantXpAdv ?? 0 }))
    const fromPayload = match?.history ?? []
    return fromArchive.length >= fromPayload.length ? fromArchive : fromPayload
  }, [timeline, match])

  const currentMinute = scrubbing
    ? cursorMinute
    : match?.duration !== undefined
      ? Math.floor(match.duration / 60)
      : null

  /**
   * Nothing to draw — and which kind of nothing, because the two have different remedies.
   *
   * Every source has to have settled first, the archive included: the demo build answers
   * the archive endpoints from its own export, so unlike before it is a source that can
   * still be loading here rather than one that is switched off.
   */
  const hasArchiveRows = (timeline?.timeline.length ?? 0) > 0 || (timeline?.events.length ?? 0) > 0
  const nothingToShow =
    match === undefined &&
    !hasArchiveRows &&
    live.isMissing &&
    !timelineQuery.isLoading &&
    !snapshot.isLoading

  return {
    match,
    ...derived,
    history,
    isLoading: scrubbing ? snapshot.isLoading : live.isLoading,
    gameState: match?.game_state,
    scrubbing,
    lastMinute,
    currentMinute,
    timeline,
    isArchivedOnly: !live.match,
    // Compared against the minute actually requested rather than trusting the server's
    // `exact`, which is only set when the request predates the FIRST snapshot. Asking for
    // a minute the recorder has not reached yet is the far more common case and used to
    // pass silently: the header said "Replaying minute 30" over minute 25's board.
    inexact:
      scrubbing && snapshot.data !== undefined ? snapshot.data.minute !== cursorMinute : false,
    shownMinute: snapshot.data?.minute ?? null,
    // Only a failed answer counts. A query still in flight, or disabled because the live
    // view needs no minute, must not read as "this match cannot be scrubbed" — that would
    // hide the control on every match for the first moment of every visit.
    timeTravel: !snapshot.isError,
    reconstructed: match !== undefined && snapshot.data?.reconstructed === true,
    itemsAreFinal: match !== undefined && snapshot.data?.itemsAreFinal === true,
    assistsKnown: match !== undefined && snapshot.data?.assistsKnown === true,
    notFound: nothingToShow && !IS_DEMO,
    notInRecording: nothingToShow && IS_DEMO,
  }
}
