import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { buildingDecoder } from '@shared/buildingDecoder'
import type { LiveGamesResponse } from './useLiveGames'

/**
 * Returns detailed data for a single live match, derived from the shared ['live-games'] cache.
 *
 * Data flow (per D-11, D-12, D-14, D-15):
 *   1. Synchronous cache read via getQueryData — no network on cache hit.
 *   2. useQuery with queryKey ['live-games'] always enabled — triggers fetch on cache miss.
 *   3. refetchInterval: false when game_state === 6 (post-game) — stops quota drain.
 *   4. useEffect redirect: fires only after isFetched === true AND match still absent.
 *
 * CRITICAL (TQ v5): refetchInterval is a plain number. Draft-speed 5s polling lives in useDraftDetail (Phase 4 D-12/D-13).
 * CRITICAL (TQ v5): onSuccess removed — derive all state from query.data reactively.
 * CRITICAL: Do NOT set enabled: !!matchFromCache — that prevents refetch on cache miss (breaks D-15).
 */
export function useMatchDetail(matchId: string | undefined) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Synchronous cache read — does NOT trigger a network fetch (TQ v5: getQueryData is read-only).
  // Used only to compute refetchInterval before query.data is available.
  const cached = queryClient.getQueryData<LiveGamesResponse>(['live-games'])
  const matchFromCache = cached?.games?.find((g) => String(g.match_id) === matchId)

  // useQuery uses the SAME queryKey ['live-games'] as useLiveGames — shares the cache.
  // enabled is unset (defaults to true) so a cache miss triggers an immediate fetch (D-15).
  const query = useQuery<LiveGamesResponse>({
    queryKey: ['live-games'],
    queryFn: async () => {
      const r = await fetch('/api/live/games')
      if (!r.ok) throw new Error(`BFF error: ${r.status}`)
      return r.json()
    },
    // D-12: plain 30s interval. D-14: stop polling when post-game (game_state === 6).
    refetchInterval: matchFromCache?.game_state === 6 ? false : 30_000,
    staleTime: 25_000, // matches useLiveGames — avoids redundant refetch on back-navigation
  })

  const match = query.data?.games?.find((g) => String(g.match_id) === matchId)

  // D-15: redirect to home if match absent after fetch completes.
  // isFetched guard prevents premature redirect before the network call settles.
  useEffect(() => {
    if (!query.isFetching && query.isSuccess && !match) {
      navigate('/')
    }
  }, [query.isFetching, query.isSuccess, match, navigate])

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
    gameState: match?.game_state,
  }
}
