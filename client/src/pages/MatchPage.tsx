import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { seriesWinsBySide } from '../utils/seriesWins'
import { findLiveGameForSeries, shouldArmSeriesFollow } from '../utils/liveSeries'
import { fetchLiveGames, type LiveGamesResponse } from '../hooks/useLiveGames'
import PageShell from '../components/PageShell'
import { useMatchState } from '../hooks/useMatchState'
import { useMatchSeries, useH2H, useMatchAnalysis } from '../hooks/useArchive'
import MatchEventFeed from '../components/MatchEventFeed'
import H2HPanel from '../components/H2HPanel'
import NotRecordedNotice from '../components/NotRecordedNotice'
import { useTimelineCursor } from '../store/timelineCursor'
import { IS_DEMO } from '../lib/apiFetch'
import SeriesTabs from '../components/SeriesTabs'
import TimelineScrubber from '../components/TimelineScrubber'
import ScoreHeader from '../components/ScoreHeader'
import HeroPlayerGrid from '../components/HeroPlayerGrid'
import BuildingsSection from '../components/BuildingsSection'
import DotaMapView from '../components/DotaMapView'
import DraftSection from '../components/DraftSection'
import { useDraftDetail } from '../hooks/useDraftDetail'
import { useHeroStats } from '../hooks/useHeroStats'
import { useMatchIntel } from '../hooks/useMatchIntel'
import WinProbBar from '../components/WinProbBar'
import { useWinProbability } from '../hooks/useWinProbability'
import ItemsBlock from '../components/ItemsBlock'
import CooldownsBlock from '../components/CooldownsBlock'
import RoshanBlock from '../components/RoshanBlock'
import HistoryGraphs from '../components/HistoryGraphs'
import { BentoErrorBoundary } from '../components/BentoErrorBoundary'

export default function MatchPage() {
  const { matchId } = useParams()
  // v2.0: useMatchState resolves either the live payload or an archived minute. Both
  // arrive in the same shape, so every panel below is unchanged.
  const {
    match,
    radiantPlayers,
    direPlayers,
    buildings,
    history,
    isLoading,
    scrubbing,
    lastMinute,
    currentMinute,
    timeline,
    isArchivedOnly,
    reconstructed,
    itemsAreFinal,
    assistsKnown,
    inexact,
    shownMinute,
    notFound,
    notInRecording,
  } = useMatchState(matchId)
  const setCursorMinute = useTimelineCursor((s) => s.setMinute)
  // Head-to-head sits behind a pill next to the map tabs: reachable in one click, and
  // otherwise not between the reader and the match.
  const [showPrevious, setShowPrevious] = useState(false)
  const series = useMatchSeries(matchId)
  const h2h = useH2H(matchId)
  const analysis = useMatchAnalysis(matchId)
  /**
   * The three live-only endpoints. All of them answer 404 for a match that is not in
   * Valve's feed, so an archived match page used to fire them anyway and retry each one —
   * a dozen wasted requests per open, every one of them touching the Valve fast lane on
   * the server. `isArchivedOnly` is already known here; use it.
   */
  const liveEndpoints = { enabled: !isArchivedOnly }
  const draft = useDraftDetail(matchId, liveEndpoints)
  const heroStatsMap = useHeroStats()
  const intel = useMatchIntel(matchId, liveEndpoints)
  // The match's own clock drives the win-probability cadence. Deriving it from that
  // query's last response deadlocked it: opened during the draft, it never polled again.
  const winProb = useWinProbability(
    matchId,
    { gameState: match?.game_state, duration: match?.duration },
    liveEndpoints,
  )

  // While scrubbing, the snapshot's own radiant_series_wins is the score as it stood at
  // that minute, which is what time travel is for. On the live view it is the score as it
  // stood at capture — so a finished map shows the series without its own result, which is
  // how a decider read "0-0 · Bo3". The archive's series row is the current answer.
  const seriesWins = useMemo(
    () => (scrubbing ? null : seriesWinsBySide(series.data?.series, match?.radiant_team?.team_id)),
    [scrubbing, series.data, match],
  )

  /**
   * The parsed final result, taken from the series payload this page already loads rather
   * than a request of its own. Only offered on the live view of a finished match — while
   * scrubbing, the minute on screen is supposed to show its own score — and only once the
   * backfill has actually written one, so an unparsed match keeps the last sample.
   */
  const finalResult = useMemo(() => {
    if (scrubbing) return null
    const own = series.data?.games?.find((g) => String(g.matchId) === matchId)
    if (!own || own.radiantScore === null || own.direScore === null) return null
    if (own.ingestStatus !== 'complete') return null
    return { radiantScore: own.radiantScore, direScore: own.direScore, duration: own.duration }
  }, [scrubbing, series.data, matchId])

  // Build playerIntelMap: heroId → PlayerIntel for quick lookup by portrait slots (DraftPortrait looks up by heroId)
  // IMPORTANT: indexed by heroId (not accountId) — DraftPortrait receives heroId from the slot
  // Same condition CooldownsBlock uses to decide it has nothing to draw. Kept here too
  // because the wrapper card is drawn by this page, not by the component.
  /**
   * The map is finished: it is no longer in Valve's live feed, or the payload says so.
   *
   * Everything that predicts rather than reports has to go once that is true — a win
   * probability for a game with a winner, a Roshan respawn that will never happen, a
   * countdown over a hero who is not coming back.
   */
  const matchOver = isArchivedOnly || match?.game_state === 6

  /**
   * Follow the series into its next map.
   *
   * A finished game used to be a dead end: the next one starts, its draft runs for several
   * minutes, and the page sits on the map that already ended — the drafts are the part you
   * cannot catch up on afterwards, so missing them is the expensive failure. The archive is
   * no help here, because Valve publishes the new match id minutes after the game begins;
   * the live feed has it immediately, keyed by the same pair of teams.
   */
  /**
   * "While you were here" has an expiry.
   *
   * This poll waits for the NEXT map of the series to appear in Valve's feed, which only
   * makes sense for a map that has just ended. `matchOver` is also true of a game from last
   * March, so an archived match left this running every 30 seconds for as long as the tab
   * stayed open — following a series that finished months ago.
   */
  const endedRecently = useMemo(() => {
    const own = series.data?.games?.find((g) => String(g.matchId) === matchId)
    if (!own?.startTime) return true // unknown age — assume it is current and keep watching
    const endedAt = own.startTime + (own.duration ?? 0)
    return Date.now() / 1000 - endedAt < 3 * 3_600
  }, [series.data, matchId])

  const liveGames = useQuery<LiveGamesResponse>({
    queryKey: ['live-games'],
    queryFn: fetchLiveGames,
    // Only while there is something to wait for. useMatchDetail deliberately stops polling
    // at game_state 6, and this must not quietly undo that for a match nobody is following.
    refetchInterval: matchOver && !scrubbing && endedRecently ? 30_000 : false,
    staleTime: 25_000,
  })
  const liveInSeries = useMemo(
    () => findLiveGameForSeries(liveGames.data?.games ?? [], series.data?.series),
    [liveGames.data, series.data],
  )

  /**
   * Armed only when the series had no other live game as this map was opened.
   *
   * Following must mean "the next map started while you were here", not "you are not
   * allowed to look at this one". Clicking Game 1 in the tabs while Game 3 is live has to
   * open Game 1.
   *
   * The decision is stored WITH the map it was made for, and that is the whole point.
   * Switching tabs does not remount this page — only the route param changes — so a plain
   * boolean stayed `true` from the live map, and the redirect fired on the first render of
   * the new one, before any effect could reset it. Tagging the decision makes a param
   * change invalidate it during render instead of an effect later, which is the only
   * ordering that cannot race.
   */
  const [armed, setArmed] = useState<{ matchId: string; follow: boolean } | null>(null)
  useEffect(() => {
    if (!matchId || armed?.matchId === matchId) return
    if (!series.data || !liveGames.isFetched) return
    setArmed({ matchId, follow: shouldArmSeriesFollow(liveInSeries, matchId) })
  }, [armed, matchId, series.data, liveGames.isFetched, liveInSeries])
  const autoFollow = armed !== null && armed.matchId === matchId && armed.follow

  const followTo =
    autoFollow === true && matchOver && !scrubbing && liveInSeries !== null && String(liveInSeries) !== matchId
      ? liveInSeries
      : null

  /**
   * hero id → the player on it and their team tag, for the event log.
   *
   * Built from the roster on screen, so it follows the map being shown — including a
   * scrubbed minute, where the sides are whatever they were then. The tag comes from the
   * series payload keyed by team id, never by team1/team2 position: sides swap between
   * maps, and the series' own ordering says nothing about who is Radiant here.
   */
  const heroOwners = useMemo(() => {
    const s = series.data?.series
    const tagOf = (teamId: number | undefined): string | null => {
      if (!teamId || !s) return null
      if (teamId === s.team1Id) return s.team1Tag ?? null
      if (teamId === s.team2Id) return s.team2Tag ?? null
      return null
    }
    const radiantTag = tagOf(match?.radiant_team?.team_id)
    const direTag = tagOf(match?.dire_team?.team_id)

    const map = new Map<number, { player: string | null; tag: string | null; side: 0 | 1 }>()
    for (const [list, tag, side] of [
      [radiantPlayers, radiantTag, 0],
      [direPlayers, direTag, 1],
    ] as const) {
      for (const p of list) {
        if (typeof p.hero_id === 'number' && p.hero_id > 0) {
          map.set(p.hero_id, { player: p.name ?? null, tag, side })
        }
      }
    }
    return map
  }, [series.data, match, radiantPlayers, direPlayers])

  /**
   * The rosters as the item and cooldown panels want them, built once per roster change.
   *
   * These are props of memoised panels, and this page carries four to five pollers — a
   * fresh array literal in the JSX made every panel below re-render on every tick of every
   * one of them, whether or not anything it draws had moved.
   */
  const sidedPlayers = useMemo(
    () => [
      ...radiantPlayers.map((p) => ({ ...p, team: 'radiant' as const })),
      ...direPlayers.map((p) => ({ ...p, team: 'dire' as const })),
    ],
    [radiantPlayers, direPlayers],
  )
  // Copied before sorting: the shared array is handed to the cooldown panel unsorted.
  const playersByNetWorth = useMemo(
    () =>
      [...sidedPlayers].sort((a, b) => (b.net_worth ?? 0) - (a.net_worth ?? 0)),
    [sidedPlayers],
  )
  /*
   * Read off the raw rosters rather than off `sidedPlayers`: Valve's extra fields reach us
   * through PlayerDetail's index signature, and an object spread does not carry that
   * signature into the spread type, so `position_x` and friends are only visible here.
   */
  const hasCooldowns = useMemo(
    () =>
      radiantPlayers.some((p) => p.ultimate_state != null) ||
      direPlayers.some((p) => p.ultimate_state != null),
    [radiantPlayers, direPlayers],
  )

  /** Everyone the map can draw: a hero id and a position both have to be known. */
  const heroPositions = useMemo(
    () =>
      ([[radiantPlayers, 'radiant'], [direPlayers, 'dire']] as const).flatMap(([list, team]) =>
        list
          .filter(
            (p) =>
              typeof p.position_x === 'number' &&
              typeof p.position_y === 'number' &&
              typeof p.hero_id === 'number',
          )
          .map((p) => ({
            hero_id: p.hero_id as number,
            team,
            position_x: p.position_x as number,
            position_y: p.position_y as number,
          })),
      ),
    [radiantPlayers, direPlayers],
  )

  const playerIntelMap = useMemo(
    () =>
      intel.data
        ? Object.fromEntries(intel.data.players.map((p) => [p.heroId, p]))
        : undefined,
    [intel.data],
  )

  // replace, so Back does not land on the finished map and bounce forward again.
  if (followTo !== null) return <Navigate to={`/match/${followTo}`} replace />

  /**
   * The demo is a recording being replayed, and the scrubber can stand before this match
   * began. That used to navigate('/') from inside useMatchDetail — the page closed itself,
   * with no explanation and nothing to undo. Say where the match went instead; dragging
   * forward brings it back.
   */
  if (notInRecording) {
    return (
      <PageShell backTo={{ to: '/', label: 'Matches' }} eyebrow="Demo replay" title="Not in the recording here">
        <p className="bento-card text-body text-text-dim">
          This match isn't in the recording at this point — move the scrubber forward to reach
          the moment it was captured. The demo replays one fixed capture, so games appear and
          disappear as the cursor moves through it.
        </p>
      </PageShell>
    )
  }

  /**
   * Nothing anywhere for this id. Falling through to the normal page drew a "TBD vs TBD"
   * header over a NotRecordedNotice that blamed an untracked league — a confident wrong
   * reason, because `leagueId` was undefined for the same reason everything else was.
   */
  if (notFound) {
    return (
      <PageShell backTo={{ to: '/', label: 'Matches' }} title="Match not found">
        <p className="bento-card text-body text-text-dim">
          Nothing is held under match{' '}
          <span className="font-mono tabular-nums text-text-muted">{matchId}</span>. It is not in Valve's
          live feed and the archive returned no snapshot of it — the game may never have been
          recorded, the id may be wrong, or the archive may be unavailable right now.
        </p>
        <p className="mt-4 text-body">
          {/* D-9: sole content of its own paragraph, so the 44px box has room. */}
          <Link
            to="/"
            className="text-primary hover:underline max-sm:inline-flex max-sm:items-center max-sm:min-h-11"
          >
            Back to live matches
          </Link>
        </p>
      </PageShell>
    )
  }

  return (
    <PageShell
      glow
      backTo={{ to: '/', label: 'Matches' }}
      eyebrow={match?.league_name}
      title={
        <>
          {match?.radiant_team?.team_name ?? 'TBD'}
          <span className="text-text-dim"> vs </span>
          {match?.dire_team?.team_name ?? 'TBD'}
        </>
      }
    >
      {/* Series map tabs — "what happened on game 1 while game 2 is live" (v2.0). */}
      <div className="mb-4">
        <SeriesTabs
          games={series.data?.games ?? []}
          currentMatchId={matchId}
          bestOf={series.data?.series?.bestOf ?? null}
          team1Name={series.data?.series?.team1Name}
          team2Name={series.data?.series?.team2Name}
          team1Wins={series.data?.series?.team1Wins}
          team2Wins={series.data?.series?.team2Wins}
          /*
           * Always present, never conditional on the query. Gating it on h2h.data made the
           * pill vanish and reappear on every map switch, which looked like a glitch — and
           * the panel behind it already handles loading and empty states itself.
           */
          extraTab={{ label: 'Previous games', active: showPrevious, onClick: () => setShowPrevious((v) => !v) }}
        />
        {showPrevious && (
          <div className="mt-3">
            <H2HPanel
              data={h2h.data}
              radiantName={match?.radiant_team?.team_name}
              direName={match?.dire_team?.team_name}
              isLoading={h2h.isLoading}
            />
          </div>
        )}
      </div>

      {/* Minute scrubber over the archived timeline (v2.0). The demo build has no archive
          behind it — it carries its own replay control in DemoBanner — so it is left out
          there rather than rendering a permanently empty control. */}
      {!IS_DEMO && (
        <TimelineScrubber
          lastMinute={lastMinute}
          currentMinute={currentMinute}
          events={timeline?.events ?? []}
          isLiveMatch={!isArchivedOnly && match?.game_state !== 6}
          snapshotRange={timeline?.snapshots}
        />
      )}

      {scrubbing && (
        <p className="mt-3 text-label uppercase tracking-label text-accent">
          {/* Say which minute is actually on screen. The archive answers with the nearest
              minute it holds, so dragging past the recorder — routine on a live match —
              used to label someone else's board with the minute you asked for. */}
          {inexact && shownMinute !== null
            ? `Minute ${currentMinute} is not recorded — showing minute ${shownMinute}`
            : `Replaying minute ${currentMinute} — not live`}
        </p>
      )}

      {/* Say it once, at the top, rather than leaving three panels mysteriously blank.
          Nobody watched this game as it happened, so there is no live detail to show —
          that is a property of the recording, not a fault in the page. */}
      {reconstructed && (
        <p className="mt-3 text-label text-text-dim">
          Rebuilt from the parsed replay — no live recording of this game exists, so ability
          cooldowns and hero positions are unavailable
          {itemsAreFinal
            ? ', and the item slots are each player’s final build rather than what they held at this minute'
            : ', along with the item slots'}
          {!assistsKnown && ', and assists are only recorded as a match total, so they appear at the final minute'}.
        </p>
      )}

      {/* Score block — featured Neon Bento card with violet glow (D-01 section order step 2) */}
      <div className="bento-card mt-2 bg-[radial-gradient(ellipse_at_center,var(--color-primary-soft),transparent_70%)]">
        <BentoErrorBoundary resetKeys={[matchId]}>
          {match && (
            <ScoreHeader
              match={match}
              isLive={!scrubbing && !isArchivedOnly}
              seriesWins={seriesWins}
              finalResult={finalResult}
              // A past minute of a finished match is still a live moment being replayed.
              atLiveMoment={scrubbing || !matchOver}
            />
          )}

          {/* Phase 6 gap closure: three-bar win probability panel — Gold and Est. always
              visible past 5 min. Gone once the game has a winner: a prediction about a
              settled result is noise at best.
              Gated on winProb.data as well: the fallbacks used to draw a confident 50/50
              while the request was still in flight or had failed, which is indistinguishable
              from a genuinely even game. Nothing is the honest state for "not known yet". */}
          {!matchOver && winProb.data && <WinProbBar
            stratz={winProb.data.stratz}
            gold={winProb.data.gold}
            estimate={winProb.data.estimate}
            gameDuration={match?.duration}
            gameState={match?.game_state}
          />}
        </BentoErrorBoundary>
      </div>

      {/* Say why the timeline, event log and analysis are absent rather than silently
          omitting three panels — an unrecorded league looks identical to a bug otherwise. */}
      {!IS_DEMO && (
        <div className="mt-6">
          <NotRecordedNotice
            leagueId={match?.league_id}
            leagueName={match?.league_name}
            hasArchive={(timeline?.timeline.length ?? 0) > 0 || (timeline?.events.length ?? 0) > 0}
          />
        </div>
      )}

      {/* Draft before the event log: the picks and bans happen before minute zero, and
          reading the log means already knowing what each side drafted. It also puts the
          hover intel — counters, and how much the player has played the hero — next to
          the score rather than below a list that grows all game. */}
      {/* D-10: mount only when scoreboard present. Phase 5: heroStatsMap and playerIntelMap
          drive the badge strips (DRAFT-03) and the hover card (DRAFT-04). */}
      {draft.scoreboard && (
        <DraftSection
          scoreboard={draft.scoreboard}
          gameState={draft.gameState}
          activeTeam={draft.activeTeam}
          action={draft.action}
          tentative={draft.tentative}
          heroStatsMap={heroStatsMap}
          playerIntelMap={playerIntelMap}
        />
      )}

      {/* One stream: the log, the teamfights that group it, and the post-match read
          folded in where each part belongs in time (v2.0). */}
      {!IS_DEMO && (
        <div className="mt-6">
          <MatchEventFeed
            events={timeline?.events ?? []}
            timeline={timeline?.timeline ?? []}
            analysis={analysis.data}
            radiantName={match?.radiant_team?.team_name}
            direName={match?.dire_team?.team_name}
            radiantLogo={match?.team_logos?.radiant}
            direLogo={match?.team_logos?.dire}
            heroOwners={heroOwners}
          />
        </div>
      )}

      {/* Pre-game / loading skeleton — show HeroPlayerGrid alone when in-game gate is closed */}
      {!(match?.game_state === 5 && radiantPlayers.length > 0) && (
        <div className="bento-card mt-12">
          <BentoErrorBoundary resetKeys={[matchId]}>
            <HeroPlayerGrid
              radiantPlayers={radiantPlayers}
              direPlayers={direPlayers}
              isLoading={isLoading}
              matchOver={matchOver}
              playerIntelMap={playerIntelMap}
            />
          </BentoErrorBoundary>
        </div>
      )}

      {/* In-game three-row layout (sketch 002-C).
          Row 1 (items-stretch): HeroPlayerGrid | ItemsBlock | CooldownsBlock — equal height, width
            split 1.3 / 1.15 / 0.75 by how much each panel actually has to draw (2026-08-11: an even
            split clipped the hero grid's last column and crushed its player names to zero width).
          Row 2 (2×flex-1, items-stretch): DotaMapView | RoshanBlock — 50/50 split.
          Row 3 (2×flex-1, items-stretch): BuildingsSection | HistoryGraphs — 50/50 split.
            When buildings.unavailable, a transparent placeholder div holds the left slot so HistoryGraphs
            still occupies the right half (preserves 50% chart width across pre/post tower-state availability).
          DotaMapView responsive SVG (10.2-03) carries over unchanged.
          CooldownsBlock root (`flex flex-col flex-1 min-h-0 overflow-y-auto`, 10.2-03) carries over unchanged.
          RoshanBlock root (`flex flex-col flex-1`) carries over unchanged. */}
      {match?.game_state === 5 && radiantPlayers.length > 0 && (
        <div className="mt-12 flex flex-col gap-12">
          {/* Row 1 — heroes / items / cooldowns. Mobile-first: stacked below 1180px, 3-col at/above. */}
          <div className="flex flex-col gap-6 stack:flex-row stack:gap-8 stack:items-stretch">
            {/* The hero grid carries eight columns against the other two panels' three, so it gets
                the larger share of the row — at an even split its last column was clipped. */}
            <div className="bento-card min-w-0 stack:flex-[1.3]">
              <BentoErrorBoundary resetKeys={[matchId]}>
                <HeroPlayerGrid
                  radiantPlayers={radiantPlayers}
                  direPlayers={direPlayers}
                  isLoading={isLoading}
                  matchOver={matchOver}
                  playerIntelMap={playerIntelMap}
                />
              </BentoErrorBoundary>
            </div>
            {/* Items needs room for six 32px slots plus rank, portrait and net worth. */}
            <div className="bento-card min-w-0 stack:flex-[1.15] flex flex-col">
              <BentoErrorBoundary resetKeys={[matchId]}>
                <ItemsBlock players={playersByNetWorth} />
              </BentoErrorBoundary>
            </div>
            {/* Cooldowns is two icons and a word — it can give width to its denser neighbours.
                A parsed replay carries no cooldown state at all, so on a reconstructed match
                the card would otherwise be an empty box taking a quarter of the row: the
                component returns null and the wrapper has to go with it. */}
            {hasCooldowns && (
              <div className="bento-card min-w-0 stack:flex-[0.75] flex flex-col">
                <BentoErrorBoundary resetKeys={[matchId]}>
                  <CooldownsBlock players={sidedPlayers} gameDuration={match?.duration} />
                </BentoErrorBoundary>
              </div>
            )}
          </div>

          {/* Row 2 — HistoryGraphs | Roshan+Buildings (320px) | Map (fluid, 420px cap).
              Mobile-first: stacked below 1180px, 3-col at/above; map fluid + centered when stacked. */}
          <div className="flex flex-col gap-8 stack:flex-row stack:items-start">
            <div className="min-w-0 stack:flex-1 flex flex-col">
              <HistoryGraphs
                history={history}
                gameDuration={match?.duration}
                gameState={match?.game_state}
                cursorT={scrubbing && currentMinute !== null ? currentMinute * 60 : null}
                onScrub={setCursorMinute}
              />
            </div>
            <div className="bento-card w-full stack:w-[320px] stack:shrink-0 flex flex-col gap-8" data-slot="roshan-buildings">
              <BentoErrorBoundary resetKeys={[matchId]}>
                <RoshanBlock roshan={match?.roshan ?? null} matchOver={matchOver} />
                {!buildings.unavailable && (
                  <BuildingsSection buildings={buildings} />
                )}
              </BentoErrorBoundary>
            </div>
            <div className="bento-card w-full stack:w-auto stack:shrink-0 flex justify-center">
              <BentoErrorBoundary resetKeys={[matchId]}>
                <DotaMapView size={420} buildings={buildings} heroPositions={heroPositions} />
              </BentoErrorBoundary>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
