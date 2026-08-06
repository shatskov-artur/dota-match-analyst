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
 * CRITICAL (v5): refetchInterval callback reads q.state.data — NOT a select-transformed view.
 * CRITICAL: returns undefined while loading or on error — WinProbBar handles gracefully.
 * SECURITY: T-6-05 — computeWinProbInterval returns false for gameState===6 (stops polling).
 */
export function useWinProbability(matchId: string | undefined) {
  return useQuery<WinProbResponse>({
    queryKey: ['win-prob', matchId],
    queryFn: () => fetchWinProb(matchId!),
    enabled: !!matchId,
    refetchInterval: (q: Query<WinProbResponse>) =>
      computeWinProbInterval(
        q.state.data?.gameState ?? undefined,
        q.state.data?.duration ?? undefined,
      ),
    staleTime: 25_000,
  })
}
