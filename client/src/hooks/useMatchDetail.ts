import { useQuery, useQueryClient } from '@tanstack/react-query'
import { buildingDecoder } from '@shared/buildingDecoder'
import { apiFetch } from '../lib/apiFetch'
import type { LiveGamesResponse } from './useLiveGames'

/**
 * Pure helper — exported for unit testing (11-03 useMatchDetail.test.ts).
 * Mirrors computeWinProbInterval / computeIntelInterval / computeDraftInterval pattern.
 *
 * Polling cadence for the in-game match detail poller (D-12 / D-14):
 *   game_state === 6 (post-game) → false  (CLAUDE.md §Critical Pitfalls — MUST stop; finished matches drain quota)
 *   anything else                → 30_000 ms (30s in-game cadence)
 */
export function computeMatchInterval(gameState: number | undefined): number | false {
  return gameState === 6 ? false : 30_000
}

/**
 * Whether this poller still has anything to wait for.
 *
 * `computeMatchInterval(undefined)` is 30s, which is right while the first response is in
 * flight and wrong forever afterwards: a match that is NOT in Valve's live feed is a match
 * that has finished, and an archived one is never coming back. Opening a match from last
 * month therefore left a tab asking Valve for the live list every 30 seconds for as long
 * as it stayed open. Once a fetch has completed and the match is not in it, stop.
 */
export function shouldPollLiveFeed(hasFetched: boolean, matchPresent: boolean): boolean {
  return !hasFetched || matchPresent
}

/**
 * Returns detailed data for a single live match, derived from the shared ['live-games'] cache.
 *
 * Data flow (per D-11, D-12, D-14, D-15):
 *   1. Synchronous cache read via getQueryData — no network on cache hit.
 *   2. useQuery with queryKey ['live-games'] always enabled — triggers fetch on cache miss.
 *   3. refetchInterval: false when game_state === 6 (post-game) — stops quota drain.
 *   4. `isMissing` reports "the feed has answered and this match is not in it" — the caller
 *      decides what that means. It used to navigate('/') from inside this hook, which in the
 *      demo build closed the match page the moment the replay cursor moved behind the match.
 *      A page that removes itself is not a state anyone can read or recover from.
 *
 * CRITICAL (TQ v5): refetchInterval is a plain number. Draft-speed 5s polling lives in useDraftDetail (Phase 4 D-12/D-13).
 * CRITICAL (TQ v5): onSuccess removed — derive all state from query.data reactively.
 * CRITICAL: Do NOT set enabled: !!matchFromCache — that prevents refetch on cache miss (breaks D-15).
 */
export interface UseMatchDetailOptions {
  /** Stop polling while the viewer is scrubbing the past — the live payload is unused then. */
  paused?: boolean
}

export function useMatchDetail(matchId: string | undefined, options: UseMatchDetailOptions = {}) {
  const { paused = false } = options
  const queryClient = useQueryClient()

  // Synchronous cache read — does NOT trigger a network fetch (TQ v5: getQueryData is read-only).
  // Used only to compute refetchInterval before query.data is available.
  const cached = queryClient.getQueryData<LiveGamesResponse>(['live-games'])
  const matchFromCache = cached?.games?.find((g) => String(g.match_id) === matchId)

  // useQuery uses the SAME queryKey ['live-games'] as useLiveGames — shares the cache.
  // enabled is unset (defaults to true) so a cache miss triggers an immediate fetch (D-15).
  const query = useQuery<LiveGamesResponse>({
    queryKey: ['live-games'],
    queryFn: async () => {
      const r = await apiFetch('/api/live/games')
      if (!r.ok) throw new Error(`BFF error: ${r.status}`)
      return r.json()
    },
    // D-12: plain 30s interval. D-14: stop polling when post-game (game_state === 6).
    // Also stop once a completed fetch has shown the match is not in the feed at all —
    // that is an archived match, and it will not reappear.
    refetchInterval: (q) =>
      paused || !shouldPollLiveFeed(q.state.data !== undefined, q.state.data?.games?.some((g) => String(g.match_id) === matchId) ?? false)
        ? false
        : computeMatchInterval(matchFromCache?.game_state),
    staleTime: 25_000, // matches useLiveGames — avoids redundant refetch on back-navigation
  })

  const match = query.data?.games?.find((g) => String(g.match_id) === matchId)

  // D-15, restated as a fact rather than an action: the feed has answered, and this match is
  // not in it. The isFetching guard keeps it false while a response is still in flight, so a
  // caller cannot mistake "not yet" for "not there".
  const isMissing = query.isSuccess && !query.isFetching && !match

  // Filter strictly to team === 0 (Radiant) and team === 1 (Dire).
  // Exclude team === 2 (Broadcaster) and team === 4 (Unassigned).
  const radiantPlayers = match?.players?.filter((p) => p.team === 0) ?? []
  const direPlayers = match?.players?.filter((p) => p.team === 1) ?? []

  // CRITICAL: pass tower_state — NOT building_state (alternate field name that breaks decoder)
  const buildings = buildingDecoder(match?.tower_state, match?.barracks_state)

  return {
    match,
    radiantPlayers,
    direPlayers,
    buildings,
    history: match?.history ?? [],
    isLoading: query.isLoading,
    isMissing,
    gameState: match?.game_state,
  }
}
