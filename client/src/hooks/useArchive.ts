import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiFetch, IS_DEMO } from '../lib/apiFetch'
import type { EnrichedGame } from './useLiveGames'

// Read hooks for the v2.0 archive (/api/tournaments, /api/series, /api/matches/*).
//
// Every one of these is disabled in the demo build: the static snapshot contains only
// the live endpoints, and firing archive requests there would 404 on every poll.

async function getJson<T>(path: string): Promise<T> {
  const r = await apiFetch(path)
  if (!r.ok) throw new Error(`BFF error: ${r.status}`)
  return r.json() as Promise<T>
}

/** Archive endpoints do not exist in the offline demo build. */
const archiveEnabled = !IS_DEMO

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Tournament {
  leagueId: number
  name: string | null
  /** Valve's opaque numeric tier. Prefer `odTier` for anything a reader sees. */
  tier: number | null
  /** OpenDota's tier name: 'premium' | 'professional' | 'amateur' | null when unknown. */
  odTier: string | null
  startTimestamp: number | null
  endTimestamp: number | null
  totalPrizePool: number | null
  description: string | null
  streams: Array<{ name?: string; stream_url?: string; language?: number }> | null
}

export interface TeamRef {
  id: number | null
  name: string | null
  tag: string | null
  logoUrl: string | null
  wins: number | null
}

export interface ScheduleEntry {
  nodeId: number
  nodeGroupId: number | null
  nodeGroupName: string | null
  phase: number | null
  name: string | null
  status: 'upcoming' | 'live' | 'finished'
  bestOf: number | null
  scheduledTime: number | null
  actualTime: number | null
  seriesId: number | null
  matchIds: number[]
  team1: TeamRef
  team2: TeamRef
}

export interface BracketNode {
  nodeId: number
  nodeGroupId: number | null
  nodeGroupName: string | null
  name: string | null
  team1Id: number | null
  team2Id: number | null
  team1Wins: number | null
  team2Wins: number | null
  seriesId: number | null
  /** Raw Valve code. Prefer `bestOf` — never map this in the client. */
  nodeType: number | null
  /** Resolved server-side by nodeTypeToBestOf. */
  bestOf: number | null
  scheduledTime: number | null
  /** When it actually began. Valve never revises scheduledTime, so these diverge. */
  actualTime: number | null
  isCompleted: boolean | null
  hasStarted: boolean | null
  winningNodeId: number | null
  incomingNodeId1: number | null
  incomingNodeId2: number | null
}

export interface Standing {
  nodeGroupId: number
  standing: number | null
  wins: number | null
  losses: number | null
  teamId: number | null
  name: string | null
  tag: string | null
  logoUrl: string | null
}

export interface ArchivedMatch {
  matchId: number
  seriesId: number | null
  leagueId: number | null
  leagueName: string | null
  gameInSeries: number | null
  radiantTeamName: string | null
  direTeamName: string | null
  radiantLogoUrl: string | null
  direLogoUrl: string | null
  startTime: number | null
  duration: number | null
  radiantWin: boolean | null
  radiantScore: number | null
  direScore: number | null
  ingestStatus: 'live' | 'awaiting_parse' | 'complete' | 'failed'
  snapshotCount: number
}

export interface TimelineRow {
  minute: number
  radiantGoldAdv: number | null
  radiantXpAdv: number | null
  radiantScore: number | null
  direScore: number | null
  radiantTowers: number | null
  direTowers: number | null
  roshanKills: number | null
  winProbGold: number | null
  winProbEstimate: number | null
  source: 'live' | 'opendota'
}

export interface MatchEvent {
  id: number
  t: number
  type: string
  team: number | null
  payload: Record<string, unknown> | null
  source: 'live' | 'opendota'
}

export interface TimelineResponse {
  matchId: number
  timeline: TimelineRow[]
  events: MatchEvent[]
  snapshots: { count: number; minMinute: number | null; maxMinute: number | null }
  lastMinute: number | null
}

export interface SnapshotAtResponse {
  matchId: number
  t: number
  minute: number
  exact: boolean
  /**
   * True when no live snapshot existed and the minute was rebuilt from the per-minute
   * rows and the event log. Items, cooldowns, map positions, denies and assists are
   * absent in that case — they only exist in a live recording.
   */
  reconstructed?: boolean
  /**
   * Item slots are the match's FINAL build rather than the inventory at this minute — the
   * replay exposes no per-minute inventory, so the exact end state is shown and labelled
   * instead of a guess reconstructed from the purchase log.
   */
  itemsAreFinal?: boolean
  /**
   * Assists are shown. The replay records no per-minute assist count — only a match
   * total — so this is true at the final minute and false everywhere else.
   */
  assistsKnown?: boolean
  game: EnrichedGame
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useTournaments() {
  return useQuery({
    queryKey: ['tournaments'],
    queryFn: () => getJson<{ tournaments: Tournament[] }>('/api/tournaments'),
    // The league row only moves when tournamentSync runs (every 5 min).
    staleTime: 5 * 60_000,
    enabled: archiveEnabled,
  })
}

export function useSchedule(leagueId: number | string | undefined) {
  return useQuery({
    queryKey: ['schedule', String(leagueId)],
    queryFn: () => getJson<{ schedule: ScheduleEntry[] }>(`/api/tournaments/${leagueId}/schedule`),
    // Matches start and finish during a tournament day — keep this fresher than the league row.
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: archiveEnabled && leagueId !== undefined,
  })
}

export function useBracket(leagueId: number | string | undefined) {
  return useQuery({
    queryKey: ['bracket', String(leagueId)],
    queryFn: () =>
      getJson<{
        groups: Array<{ id: number | null; name: string | null; phase: number | null }>
        nodes: BracketNode[]
        standings: Standing[]
        /** Maps decided per series from our own records — ahead of Valve's node score. */
        seriesResults: Array<{ seriesId: number; wins: Array<{ teamId: number; wins: number }> }>
      }>(`/api/tournaments/${leagueId}/bracket`),
    staleTime: 60_000,
    refetchInterval: 120_000,
    enabled: archiveEnabled && leagueId !== undefined,
  })
}

/** The series a match belongs to, plus every map in it — powers the Game 1/2/3 tabs. */
export function useMatchSeries(matchId: string | undefined) {
  return useQuery({
    queryKey: ['match-series', matchId],
    /*
     * Keep the previous match's answer on screen while the next one loads.
     *
     * Switching Game 1 → Game 2 changes every one of these query keys at once, so without
     * this the board, the stream and the tabs all unmounted together: the page collapsed
     * to a few hundred pixels and sprang back, which reads as a stall. Holding the last
     * result keeps the layout still, and because every panel holds its OWN previous
     * result the page stays internally consistent — one whole game, then the next.
     */
    placeholderData: keepPreviousData,
    queryFn: () =>
      getJson<{
        series: {
          seriesId: number
          /** Scopes a live-feed lookup, so another league's identical fixture cannot match. */
          leagueId: number | null
          bestOf: number | null
          /**
           * team1/team2 are the series' own ordering and say nothing about sides — which
           * of them is Radiant is decided per map. Map by id before reading a score.
           */
          team1Id: number | null
          team2Id: number | null
          team1Name: string | null
          team2Name: string | null
          /** Short form for log lines, joined from the teams table. Null until synced. */
          team1Tag: string | null
          team2Tag: string | null
          /** Valve's own series score — ahead of our per-map count while a replay parses. */
          team1Wins: number | null
          team2Wins: number | null
        } | null
        games: ArchivedMatch[]
      }>(`/api/matches/${matchId}/series`),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: archiveEnabled && !!matchId,
  })
}

/**
 * Per-minute rows + events. Polls while the match is still being written so the
 * scrubber's range grows with the game.
 */
export function useMatchTimeline(matchId: string | undefined, isLiveMatch = false) {
  return useQuery({
    queryKey: ['match-timeline', matchId],
    placeholderData: keepPreviousData,
    queryFn: () => getJson<TimelineResponse>(`/api/matches/${matchId}/timeline`),
    staleTime: isLiveMatch ? 15_000 : Infinity,
    refetchInterval: isLiveMatch ? 30_000 : false,
    enabled: archiveEnabled && !!matchId,
    // A match with no archive rows yet is an expected state, not an error worth retrying hard.
    retry: 1,
  })
}

/**
 * Full reconstructed state at a minute. The response's `game` has the same shape as one
 * element of /api/live/games, which is what lets MatchPage render it unchanged.
 *
 * IMMUTABLE ONLY WHEN IT IS ACTUALLY THAT MINUTE.
 * A past minute never changes, so caching it forever is right — but the server answers
 * with the nearest minute it HAS, which during a live match is routinely not the one that
 * was asked for. Scrubbing to minute 30 of a match recorded to 25 returns minute 25, and
 * a blanket `staleTime: Infinity` filed that under the key for minute 30 permanently: ten
 * minutes later, with minute 30 genuinely recorded, the scrubber still showed 25. So the
 * answer is treated as immutable only when the minute returned is the minute requested,
 * and as ordinary short-lived data otherwise.
 */
export function useSnapshotAt(matchId: string | undefined, minute: number | null) {
  return useQuery({
    queryKey: ['snapshot-at', matchId, minute],
    placeholderData: keepPreviousData,
    queryFn: () => getJson<SnapshotAtResponse>(`/api/matches/${matchId}/at?minute=${minute}`),
    staleTime: (query) => (query.state.data?.minute === minute ? Infinity : 30_000),
    gcTime: 10 * 60_000,
    enabled: archiveEnabled && !!matchId && minute !== null,
    retry: 1,
  })
}

export function useArchivedMatches(params: { leagueId?: number | string; status?: string; limit?: number } = {}) {
  const qs = new URLSearchParams()
  if (params.leagueId !== undefined) qs.set('leagueId', String(params.leagueId))
  if (params.status) qs.set('status', params.status)
  if (params.limit) qs.set('limit', String(params.limit))
  const suffix = qs.toString() ? `?${qs}` : ''
  return useQuery({
    queryKey: ['archived-matches', suffix],
    queryFn: () => getJson<{ matches: ArchivedMatch[] }>(`/api/matches${suffix}`),
    staleTime: 30_000,
    enabled: archiveEnabled,
  })
}

export interface FormEntry {
  matchId: number
  won: boolean
  score: { own: number; opponent: number }
  opponentId: number | null
  opponentName: string | null
  opponentLogo: string | null
  leagueName: string | null
  startTime: number | null
  duration: number | null
}

export interface H2HResponse {
  radiant: { teamId: number | null; name: string | null; form: FormEntry[] }
  dire: { teamId: number | null; name: string | null; form: FormEntry[] }
  /** Record from the Radiant team's point of view. */
  h2h: {
    wins: number
    losses: number
    matches: FormEntry[]
    /** 'name' means the team ids disagreed and the rows were matched on name instead. */
    matchedBy: 'id' | 'name' | 'none'
  }
}

/**
 * Head-to-head record and recent form for both teams.
 *
 * Held for 20 minutes rather than an hour, matching the BFF's own TTL for the same data.
 * A one-hour client cache on top of what used to be a six-hour server cache meant a team's
 * form could be seven hours stale during a tournament day it was playing in.
 */
export function useH2H(matchId: string | undefined) {
  return useQuery({
    queryKey: ['h2h', matchId],
    placeholderData: keepPreviousData,
    queryFn: () => getJson<H2HResponse>(`/api/matches/${matchId}/h2h`),
    staleTime: 20 * 60_000,
    gcTime: 60 * 60_000,
    enabled: archiveEnabled && !!matchId,
    retry: 1,
  })
}

export interface AnalysisResponse {
  matchId: number
  computedAt: string
  lastMinute: number
  precision: { opendotaMinutes: number; liveMinutes: number }
  swings: Array<{ minute: number; fromGold: number; toGold: number; delta: number; kind: 'lead_change' | 'surge'; team: 0 | 1 }>
  laning: {
    atMinute: number
    goldDiff: number
    winner: 0 | 1 | null
    radiantNetWorth: number
    direNetWorth: number
    radiantLastHits: number
    direLastHits: number
  } | null
  topObjectives: Array<{
    type: string
    t: number
    minute: number
    team: number | null
    swing: number | null
    /** Everything else that happened in the same minute, e.g. { barracks: 3 }. */
    alsoAtThisMinute?: Record<string, number>
  }>
  peaks: { radiant: { gold: number; minute: number } | null; dire: { gold: number; minute: number } | null }
}

export function useMatchAnalysis(matchId: string | undefined) {
  return useQuery({
    queryKey: ['match-analysis', matchId],
    placeholderData: keepPreviousData,
    queryFn: () => getJson<AnalysisResponse>(`/api/matches/${matchId}/analysis`),
    staleTime: 5 * 60_000,
    enabled: archiveEnabled && !!matchId,
    // 404 until the match finishes and the backfill runs — an expected state.
    retry: false,
  })
}

export interface ArchiveStatus {
  configured: boolean
  reachable?: boolean
  counts?: Record<string, number>
  /** Leagues the recorder is archiving; empty means "everything". */
  trackedLeagueIds?: number[]
  /* counts is now genuinely numeric — the server casts every count(*) to int (F-2). */
  trackedLeagues?: Array<{ leagueId: number; name: string | null }>
}

export interface ScheduleRangeEntry {
  leagueId: number
  leagueName: string | null
  /** OpenDota tier name — drives the tier filter on a past or future day. */
  leagueTier: string | null
  /** Null for a series the bracket never accounted for — link by series id instead. */
  nodeId: number | null
  nodeGroupName: string | null
  name: string | null
  status: 'live' | 'upcoming' | 'finished'
  bestOf: number | null
  scheduledTime: number | null
  actualTime: number | null
  /** When it belongs on the calendar: actually played if known, else scheduled. */
  time: number
  seriesId: number | null
  matchIds: number[]
  team1: TeamRef
  team2: TeamRef
}

export interface ScheduleRangeResponse {
  from: number
  to: number
  /** The window held more than the server would return — the dots are incomplete. */
  truncated: boolean
  schedule: ScheduleRangeEntry[]
}

/**
 * Everything the archive knows about between two instants — played, running and scheduled.
 *
 * The window is passed as absolute unix seconds because days here are local and the server
 * refuses to guess a timezone. One window feeds the calendar's dots and the list beside it
 * at once, so the two cannot disagree.
 *
 * `keepPreviousData`: paging to another month should redraw the dots, not blank the
 * calendar and drop the layout out from under the cursor.
 */
export function useScheduleRange(from: number, to: number) {
  return useQuery({
    queryKey: ['schedule-range', from, to],
    queryFn: () => getJson<ScheduleRangeResponse>(`/api/schedule/range?from=${from}&to=${to}`),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchInterval: 120_000,
    enabled: archiveEnabled,
  })
}

export interface RosterPlayer {
  accountId: number | null
  name: string | null
  gamesPlayed: number
  wins: number
}

export interface PrematchResponse {
  league: { leagueId: number; name: string | null }
  node: {
    nodeId: number
    name: string | null
    nodeGroupName: string | null
    status: 'upcoming' | 'live' | 'finished'
    bestOf: number | null
    scheduledTime: number | null
    seriesId: number | null
    matchIds: number[]
  }
  team1: TeamRef & { roster: RosterPlayer[] }
  team2: TeamRef & { roster: RosterPlayer[] }
  radiant: { teamId: number | null; name: string | null; form: FormEntry[] }
  dire: { teamId: number | null; name: string | null; form: FormEntry[] }
  h2h: { wins: number; losses: number; matches: FormEntry[]; matchedBy: 'id' | 'name' | 'none' }
}

/**
 * A series that has not been played yet, keyed on (league, node) — an unplayed series
 * has no match id, which is precisely why this route exists.
 */
export function usePrematch(leagueId: string | undefined, nodeId: string | undefined) {
  return useQuery({
    queryKey: ['prematch', leagueId, nodeId],
    queryFn: () => getJson<PrematchResponse>(`/api/tournaments/${leagueId}/nodes/${nodeId}`),
    staleTime: 60_000,
    refetchInterval: 120_000,
    enabled: archiveEnabled && !!leagueId && !!nodeId,
    retry: 1,
  })
}

export function useArchiveStatus() {
  return useQuery({
    queryKey: ['archive-status'],
    queryFn: () => getJson<ArchiveStatus>('/api/archive/status'),
    staleTime: 60_000,
    enabled: archiveEnabled,
    retry: false,
  })
}
