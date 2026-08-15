import { useQuery, type Query } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiFetch'

// BFF response shape for GET /api/live/winprob/:matchId
export interface WinProbResponse {
  stratz: number | null    // Stratz live model — null when Stratz doesn't track this match
  gold: number             // gold-only sigmoid — always finite ∈ [0.05, 0.95]
  estimate: number         // multi-feature sigmoid — always finite ∈ [0.05, 0.95]
  gameState: number | null // from Valve payload — for refetchInterval callback
  duration: number | null  // from Valve payload (NOT game_time) — for refetchInterval callback
}

/**
 * Pure helper — exported for unit testing (Wave 0 useWinProbability.test.ts).
 * Mirrors computeIntelInterval / computeDraftInterval pattern exactly.
 *
 * Cadence contract (MATCH-06, D-15):
 *   game_state === 6 (postgame) → false  MUST be first guard (CLAUDE.md §Critical Pitfalls)
 *   game_state === 5 AND duration > 300 → 30_000  (in-game past 5 min)
 *   everything else → false
 */
export function computeWinProbInterval(
  gameState: number | undefined,
  duration: number | undefined,
): number | false {
  if (gameState === 6) return false          // FIRST: stop polling on postgame (CLAUDE.md pitfall)
  if (gameState === 5 && (duration ?? 0) > 300) return 30_000
  return false
}

/**
 * Which clock decides the cadence: the match's, or this query's own last answer.
 *
 * Exported because the precedence IS the bug fix. `live` (the match page's own 30s poll)
 * must win, because the fallback path can only ever repeat the state that already
 * switched the polling off — the definition of a stuck query.
 */
export function resolveWinProbInterval(
  live: { gameState?: number; duration?: number } | undefined,
  data: { gameState?: number | null; duration?: number | null } | undefined,
): number | false {
  return computeWinProbInterval(
    live?.gameState ?? data?.gameState ?? undefined,
    live?.duration ?? data?.duration ?? undefined,
  )
}

async function fetchWinProb(matchId: string): Promise<WinProbResponse> {
  const res = await apiFetch(`/api/live/winprob/${matchId}`)
  if (!res.ok) throw new Error(`BFF error: ${res.status}`)
  return res.json() as Promise<WinProbResponse>
}

/**
 * TanStack Query v5 hook — fetches Stratz win probability for a live match.
 * Dynamic refetchInterval: 30s when in-game past 5 min, false otherwise.
 * staleTime: 25_000 — slightly below 30s cadence (mirrors useMatchDetail pattern).
 *
 * THE CADENCE IS DRIVEN FROM OUTSIDE, AND IT HAS TO BE.
 * Reading gameState/duration out of `q.state.data` — this query's OWN last response —
 * is a deadlock: the interval says `false` for anything short of 5 minutes in-game, so
 * no refetch happens, so the state that would lift the gate never arrives. Opening a
 * match during the draft therefore froze the panel on its first answer FOR THE WHOLE
 * GAME (only a window refocus broke it). `live` comes from useMatchState, which polls on
 * its own 30s clock, so the moment the real match passes 5 minutes the interval starts.
 * The query's own data stays as the fallback for callers that pass nothing.
 *
 * CRITICAL: returns undefined while loading or on error — callers must not substitute
 * a neutral 50/50, which reads as a real prediction (see MatchPage).
 * SECURITY: T-6-05 — computeWinProbInterval returns false for gameState===6 (stops polling).
 */
export function useWinProbability(
  matchId: string | undefined,
  live?: { gameState?: number; duration?: number },
  options: { enabled?: boolean } = {},
) {
  return useQuery<WinProbResponse>({
    queryKey: ['win-prob', matchId],
    queryFn: () => fetchWinProb(matchId!),
    // Skippable for a match that is not in the live feed: there is no live probability for
    // a game that already has a winner, and the panel is hidden then anyway.
    enabled: !!matchId && (options.enabled ?? true),
    refetchInterval: (q: Query<WinProbResponse>) => resolveWinProbInterval(live, q.state.data),
    staleTime: 25_000,
    retry: false,
  })
}
