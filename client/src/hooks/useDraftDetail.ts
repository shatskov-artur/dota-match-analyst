import { useQuery, type Query } from '@tanstack/react-query'
import { inferActiveTeam, inferFirstPickFromHistory } from '../utils/draftOrder'
import { API_BASE } from '../lib/apiBase'

// Response shape types — mirror the Plan 02 BFF route response + CLAUDE.md .passthrough() discipline.
// `[key: string]: unknown` preserves unknown Valve fields (score, tower_state, barracks_state, heroes)
// without typing them in Phase 4.

export interface DraftItem {
  hero_id?: number
  [key: string]: unknown
}

export interface TeamScoreboard {
  picks?: DraftItem[]
  bans?: DraftItem[]
  [key: string]: unknown
}

export interface Scoreboard {
  radiant?: TeamScoreboard
  dire?: TeamScoreboard
  [key: string]: unknown
}

export interface DraftResponse {
  match_id: number
  game_state?: number
  scoreboard?: Scoreboard
}

async function fetchDraft(matchId: string): Promise<DraftResponse> {
  const res = await fetch(`${API_BASE}/api/live/draft/${matchId}`)
  if (!res.ok) throw new Error(`BFF error: ${res.status}`)
  return res.json() as Promise<DraftResponse>
}

/**
 * Pure helper — extracted and exported so the refetchInterval cadence can be
 * unit-tested without mounting React (mirrors the groupByLeague precedent in
 * useLiveGames.ts, per 04-PATTERNS.md advisory).
 *
 * D-12 cadence contract:
 *   game_state === 2 (draft)      → 5_000 ms  (DRAFT-01 "~5 second" criterion)
 *   game_state === 6 (post-game)  → false      (CLAUDE.md §Critical Pitfalls — MUST stop)
 *   game_state === 5 (in-game)    → false      (scoreboard frozen — no more picks coming)
 *   anything else / undefined     → false      (lobby / pre-data — no polling)
 */
export function computeDraftInterval(gameState: number | undefined): number | false {
  if (gameState === 2) return 5_000
  return false
}

/**
 * TanStack Query v5 hook — polls GET /api/live/draft/:matchId per D-12.
 *
 * CRITICAL (v5): refetchInterval callback reads data via `query.state.data` — NOT
 * via a `select`-transformed view (which the callback does not receive).
 * CRITICAL (PF-2): staleTime is 4_000 ms (< 5_000 refetchInterval) so the interval
 * actually fires every cycle. Higher staleTime silently skips refetches.
 *
 * Returned shape matches the Plan 04 DraftSection consumer contract:
 *   { scoreboard, gameState, activeTeam, action, tentative, isLoading, isError }
 *
 * `tentative` (D-08): true when draft is live (game_state === 2) but first-pick team
 * cannot be uniquely derived from per-team counts. DraftColumn + DraftTurnIndicator
 * render a best-guess-with-marker rather than hiding the indicator.
 */
export function useDraftDetail(matchId: string | undefined) {
  const query = useQuery<DraftResponse>({
    queryKey: ['draft', matchId],
    queryFn: () => fetchDraft(matchId!),
    enabled: !!matchId,
    refetchInterval: (q: Query<DraftResponse>) => computeDraftInterval(q.state.data?.game_state),
    staleTime: 4_000, // PF-2 — strictly below draft cadence
  })

  const scoreboard = query.data?.scoreboard
  const gameState = query.data?.game_state

  // Turn inference — runs on every render but both util calls are O(24) and allocation-light.
  // Memoization omitted by design (04-PATTERNS.md does not call for it; polling cadence is 5s).
  const firstPick = scoreboard ? inferFirstPickFromHistory(scoreboard) : null
  const radiant = scoreboard?.radiant ?? {}
  const dire = scoreboard?.dire ?? {}
  const inferred = inferActiveTeam(
    {
      rPicks: radiant.picks?.length ?? 0,
      dPicks: dire.picks?.length ?? 0,
      rBans: radiant.bans?.length ?? 0,
      dBans: dire.bans?.length ?? 0,
    },
    firstPick,
  )

  const activeTeam: 'radiant' | 'dire' | null =
    inferred?.team === 0 ? 'radiant'
      : inferred?.team === 1 ? 'dire'
      : null

  return {
    scoreboard,
    gameState,
    activeTeam,
    action: inferred?.action ?? null,
    tentative: firstPick === null && gameState === 2, // D-08 best-guess marker
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
