import { useQuery, type Query } from '@tanstack/react-query'
import { API_BASE } from '../lib/apiBase'

// Per-player intel shape returned by BFF GET /api/live/intel/:matchId
export interface CounterHero {
  heroId: number
  knownPlayers: string[]  // opposing player names meeting D-09 threshold (games >= 10 AND win/games > 0.5)
}

export interface PlayerIntel {
  accountId: number
  heroId: number
  playerName: string
  games: number | null      // null = hidden profile (PLAYER-02)
  winRate: number | null    // null = hidden profile (PLAYER-02)
  counters: CounterHero[]
}

export interface MatchIntelResponse {
  players: PlayerIntel[]
  game_state?: number       // included so refetchInterval callback can read it
}

/**
 * Pure helper — exported for unit testing (Wave 0 useMatchIntel.test.ts).
 * The hook's refetchInterval delegates to this function — same pattern as computeDraftInterval.
 *
 * Cadence contract:
 *   game_state === 2 (draft)    → 5_000 ms  (intel must stay fresh during pick/ban phase)
 *   game_state === 6 (postgame) → false      (CLAUDE.md §Critical Pitfalls — MUST stop)
 *   game_state === 5 (in-game)  → false      (picks frozen — no new intel needed)
 *   undefined / other           → false      (pre-data / lobby)
 */
export function computeIntelInterval(gameState: number | undefined): number | false {
  if (gameState === 2) return 5_000
  return false
}

async function fetchMatchIntel(matchId: string): Promise<MatchIntelResponse> {
  const res = await fetch(`${API_BASE}/api/live/intel/${matchId}`)
  if (!res.ok) throw new Error(`BFF error: ${res.status}`)
  return res.json() as Promise<MatchIntelResponse>
}

/**
 * TanStack Query v5 hook — fetches per-match player + counterpick intel.
 * Dynamic refetchInterval: 5s during draft (game_state === 2), false otherwise.
 * staleTime: 4_000 ms — strictly below 5s cadence (PF-2) so interval fires every cycle.
 *
 * CRITICAL (v5): refetchInterval callback reads `q.state.data` NOT a select-transformed view.
 * CRITICAL: returns undefined while loading or on error — UI handles gracefully (D-03, D-07).
 */
export function useMatchIntel(matchId: string | undefined) {
  return useQuery<MatchIntelResponse>({
    queryKey: ['match-intel', matchId],
    queryFn: () => fetchMatchIntel(matchId!),
    enabled: !!matchId,
    refetchInterval: (q: Query<MatchIntelResponse>) =>
      computeIntelInterval(q.state.data?.game_state),
    staleTime: 4_000,  // PF-2: strictly below 5s cadence
  })
}
