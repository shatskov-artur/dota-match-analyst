import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { format } from 'date-fns'

export interface PlayerDetail {
  account_id?: number
  hero_id?: number
  name?: string
  team?: number // 0=Radiant, 1=Dire, 2=Broadcaster, 4=Unassigned
  kills?: number
  death?: number
  assists?: number
  net_worth?: number
  respawn_timer?: number // 0 when alive, >0 when dead
  // D-08: optional extended stats — present in-game via .passthrough(), absent during draft
  level?: number
  gpm?: number
  xpm?: number
  lh?: number
  dn?: number
  [key: string]: unknown // .passthrough() — Valve adds fields silently each patch
}

export interface EnrichedGame {
  match_id: number
  league_id: number
  league_name: string
  game_state?: number
  duration?: number
  series_type?: number
  radiant_series_wins?: number
  dire_series_wins?: number
  radiant_score?: number
  dire_score?: number
  tower_state?: number
  barracks_state?: number
  stream_delay_s?: number
  players?: PlayerDetail[]
  radiant_team?: { team_name?: string }
  dire_team?: { team_name?: string }
  scoreboard?: {
    radiant?: { score?: number; [key: string]: unknown }
    dire?: { score?: number; [key: string]: unknown }
    [key: string]: unknown
  }
}

export interface LiveGamesResponse {
  games: EnrichedGame[]
}

async function fetchLiveGames(): Promise<LiveGamesResponse> {
  const res = await fetch('/api/live/games')
  if (!res.ok) throw new Error(`BFF error: ${res.status}`)
  return res.json() as Promise<LiveGamesResponse>
}

/**
 * Pure grouping function — exported for unit testing without React context.
 * Groups games by league_id, preserves insertion order, carries league_name through.
 * Keyed by league_id (number) — stable across refetches, unaffected by array reordering.
 */
export function groupByLeague(
  games: EnrichedGame[],
): Array<{ leagueName: string; matches: EnrichedGame[] }> {
  const map = new Map<number, { leagueName: string; matches: EnrichedGame[] }>()
  for (const game of games) {
    if (!map.has(game.league_id)) {
      map.set(game.league_id, { leagueName: game.league_name, matches: [] })
    }
    map.get(game.league_id)!.matches.push(game)
  }
  return Array.from(map.values())
}

/**
 * TanStack Query v5 hook — polls GET /api/live/games every 30s.
 *
 * CRITICAL (v5 breaking change): refetchInterval is a plain number — NOT a callback.
 * CRITICAL (v5 breaking change): onSuccess is removed — use dataUpdatedAt for last-fetch timestamp.
 * Per D-09: silent refetch — no spinner, stale data stays visible during background refetch.
 * Per D-10: lastUpdatedLabel uses time-only format "h:mm a" (e.g. "2:41 PM").
 */
export function useLiveGames() {
  const query = useQuery<LiveGamesResponse>({
    queryKey: ['live-games'],
    queryFn: fetchLiveGames,
    refetchInterval: 30_000, // v5: plain number only — Phase 4 upgrades to dynamic callback
    staleTime: 25_000, // treat data fresh for 25s to avoid redundant re-renders
  })

  // dataUpdatedAt: 0 before first successful fetch; millisecond epoch after each success.
  // D-10: time-only format, no date.
  const lastUpdatedLabel =
    query.dataUpdatedAt > 0
      ? `Updated ${format(new Date(query.dataUpdatedAt), 'h:mm a')}`
      : null

  const grouped = useMemo(() => groupByLeague(query.data?.games ?? []), [query.data])

  return { ...query, grouped, lastUpdatedLabel }
}
