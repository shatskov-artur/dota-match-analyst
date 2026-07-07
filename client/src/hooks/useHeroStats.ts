import { useQuery } from '@tanstack/react-query'
import { API_BASE } from '../lib/apiBase'

// Server-side transformed shape: hero_id → { win_rate, pick_rate }
// win_rate is 0–1 (e.g. 0.52 = 52%). pick_rate is raw pro_pick count from OpenDota.
export interface HeroStatsEntry {
  win_rate: number    // 0–1 float (e.g. 0.52)
  pick_rate: number   // raw pro pick count
}

export type HeroStatsMap = Record<number, HeroStatsEntry>

async function fetchHeroStats(): Promise<HeroStatsMap> {
  const res = await fetch(`${API_BASE}/api/heroes/stats`)
  if (!res.ok) throw new Error(`BFF error: ${res.status}`)
  return res.json() as Promise<HeroStatsMap>
}

/**
 * TanStack Query v5 hook — fetches global patch hero stats from BFF.
 * NO polling: patch data changes every ~2 weeks. BFF caches 6h (TTL.HERO_STATS).
 * staleTime: Infinity — TanStack Query never considers this data stale within a session.
 * refetchInterval: false — no timer-based background refetch.
 *
 * Returns undefined while loading or on error (badge strip hidden per D-03).
 */
export function useHeroStats(): HeroStatsMap | undefined {
  const query = useQuery<HeroStatsMap>({
    queryKey: ['hero-stats'],
    queryFn: fetchHeroStats,
    staleTime: Infinity,       // patch-level data — valid for entire session
    refetchInterval: false,    // no polling — BFF 6h TTL manages freshness
  })
  return query.data
}
