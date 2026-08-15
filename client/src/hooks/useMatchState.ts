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
   * The minute on screen was rebuilt from per-minute rows rather than replayed from a
   * live snapshot, so the item, cooldown and map panels have nothing to draw.
   */
  reconstructed: boolean
  /** Item slots on screen are the final build, not this minute's inventory. */
  itemsAreFinal: boolean
  /** Assists are filled — only true at a reconstructed match's final minute. */
  assistsKnown: boolean
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

  // Do not redirect home when an archive exists: a finished match is legitimately absent
  // from the live feed but fully present in the archive, and useMatchDetail's own redirect
  // would fire before the archive query resolves. The demo build has no archive, so there
  // the pre-v2.0 redirect is still the right behaviour for an unknown match.
  const live = useMatchDetail(matchId, { redirectOnMissing: IS_DEMO, paused: scrubbing })
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
    reconstructed: match !== undefined && snapshot.data?.reconstructed === true,
    itemsAreFinal: match !== undefined && snapshot.data?.itemsAreFinal === true,
    assistsKnown: match !== undefined && snapshot.data?.assistsKnown === true,
  }
}
