import type { EnrichedGame } from '../hooks/useLiveGames'
import { getStatusLabel } from './gameState'

export type StatusFilter = 'all' | 'live' | 'draft' | 'finished'
export type SortMode = 'liveFirst' | 'duration'

export interface MatchFilterState {
  status: StatusFilter
  leagueId: number | 'all'
  search: string
  sort: SortMode
}

export const DEFAULT_FILTERS: MatchFilterState = {
  status: 'all',
  leagueId: 'all',
  search: '',
  sort: 'liveFirst',
}

// Live-ness ordering for the default sort (lower = higher in list).
const STATUS_ORDER: Record<string, number> = {
  'Live': 0, 'Starting': 1, 'Strategy': 2, 'Draft': 3,
  'Waiting': 4, 'Break': 5, 'Post-game': 6, 'Unknown': 7,
}

/** Maps a raw game-state status label to the coarse status-filter bucket. */
function statusBucket(game: EnrichedGame): StatusFilter {
  const label = getStatusLabel(game.game_state, game.scoreboard)
  if (label === 'Live' || label === 'Starting' || label === 'Strategy') return 'live'
  if (label === 'Draft') return 'draft'
  if (label === 'Post-game') return 'finished'
  return 'all' // Waiting/Break/Unknown — only shown under "all"
}

/** Distinct leagues present in the games, for the league dropdown. */
export function leagueOptions(
  games: EnrichedGame[],
): Array<{ id: number; name: string }> {
  const seen = new Map<number, string>()
  for (const g of games) {
    if (!seen.has(g.league_id)) seen.set(g.league_id, g.league_name || `League ${g.league_id}`)
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }))
}

/** Applies status + league + team-search filters, then sorts. Pure. */
export function applyFilters(
  games: EnrichedGame[],
  f: MatchFilterState,
): EnrichedGame[] {
  const q = f.search.trim().toLowerCase()

  const filtered = games.filter(g => {
    if (f.status !== 'all' && statusBucket(g) !== f.status) return false
    if (f.leagueId !== 'all' && g.league_id !== f.leagueId) return false
    if (q) {
      const rad = (g.radiant_team?.team_name ?? '').toLowerCase()
      const dire = (g.dire_team?.team_name ?? '').toLowerCase()
      if (!rad.includes(q) && !dire.includes(q)) return false
    }
    return true
  })

  return [...filtered].sort((a, b) => {
    if (f.sort === 'duration') {
      return (b.duration ?? 0) - (a.duration ?? 0)
    }
    const ao = STATUS_ORDER[getStatusLabel(a.game_state, a.scoreboard)] ?? 3
    const bo = STATUS_ORDER[getStatusLabel(b.game_state, b.scoreboard)] ?? 3
    return ao - bo
  })
}
