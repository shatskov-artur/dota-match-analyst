import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { format } from 'date-fns'
import { apiFetch } from '../lib/apiFetch'

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
  /** OpenDota tier name: 'premium' | 'professional' | 'amateur'. Null when unknown. */
  league_tier?: string | null
  game_state?: number
  duration?: number
  series_type?: number
  radiant_series_wins?: number
  dire_series_wins?: number
  radiant_score?: number
  dire_score?: number
  tower_state?: number
  barracks_state?: number
  roshan_respawn_timer?: number
  roshan?: {
    killCount: number
    alive: boolean
    respawnIn: number | null
    lastKillLoot: number[] | null
    /**
     * Every Roshan of the match: which number it was, the game second it died at, and what
     * it dropped. Optional because an archived snapshot recorded before this field existed
     * replays without it — those matches show the counter alone, as they always did.
     */
    kills?: Array<{ n: number; gameTime: number; loot: number[] }>
  } | null
  stream_delay_s?: number
  players?: PlayerDetail[]
  // team_id rides along through the schema's .passthrough() and is the only reliable way
  // to recognise a side — Valve's team_name carries stray whitespace ("Nigma Galaxy ").
  radiant_team?: { team_name?: string; team_id?: number }
  dire_team?: { team_name?: string; team_id?: number }
  /** Server-resolved team avatars; either side is null when the team has no usable logo. */
  team_logos?: { radiant: string | null; dire: string | null }
  scoreboard?: {
    radiant?: { score?: number; [key: string]: unknown }
    dire?: { score?: number; [key: string]: unknown }
    [key: string]: unknown
  }
  history?: Array<{ t: number; gold: number; xp: number }>
}

export interface LiveGamesResponse {
  games: EnrichedGame[]
}

/** Exported so callers can share the ['live-games'] cache entry with their own useQuery. */
export async function fetchLiveGames(): Promise<LiveGamesResponse> {
  const res = await apiFetch('/api/live/games')
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
): Array<{ leagueId: number; leagueName: string; matches: EnrichedGame[] }> {
  const map = new Map<number, { leagueId: number; leagueName: string; matches: EnrichedGame[] }>()
  for (const game of games) {
    if (!map.has(game.league_id)) {
      map.set(game.league_id, { leagueId: game.league_id, leagueName: game.league_name, matches: [] })
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
