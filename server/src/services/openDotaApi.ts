import { z } from 'zod'
import { cached, TTL } from '../cache.js'
import { LeagueSchema, HeroStatsSchema, PlayerHeroSchema } from '../schemas/openDota.js'
import type { HeroStatsMap } from '../schemas/openDota.js'

const OPENDOTA_BASE = 'https://api.opendota.com/api'

/**
 * Fetches league name from OpenDota /leagues/{leagueId}.
 * Returns null on any error (non-ok status, parse failure, null name).
 * SECURITY: T-02-01 — response validated with LeagueSchema.safeParse() before use.
 * SECURITY: T-02-02 — logs status/statusText only, never full URL.
 */
async function fetchLeagueName(leagueId: number): Promise<string | null> {
  try {
    const res = await fetch(`${OPENDOTA_BASE}/leagues/${leagueId}`)
    if (!res.ok) {
      console.error(`[openDotaApi] League fetch error: ${res.status} ${res.statusText}`)
      return null
    }
    const raw: unknown = await res.json()
    const parsed = LeagueSchema.safeParse(raw)
    if (!parsed.success) {
      console.error(`[openDotaApi] LeagueSchema parse failure for league ${leagueId}`)
      return null
    }
    return parsed.data.name ?? null
  } catch (err) {
    console.error(`[openDotaApi] Error fetching league ${leagueId}:`, (err as Error).message)
    return null
  }
}

/**
 * Returns league name cached 6h server-side by league_id.
 * Returns null when OpenDota does not know this league (caller applies fallback label).
 * Per CLAUDE.md: cached() is the ONLY path to upstream. Never call fetchLeagueName directly.
 * TTL.HERO_STATS = 21_600s = 6h — per D-06.
 */
export function getLeagueName(leagueId: number): Promise<string | null> {
  return cached(`league:${leagueId}`, TTL.HERO_STATS, () => fetchLeagueName(leagueId))
}

// ─── Hero Stats ─────────────────────────────────────────────────────────────

/**
 * Pure transform helper — exported for unit testing (Wave 0 openDotaApi.test.ts).
 * Converts raw heroStats array → HeroStatsMap keyed by hero id.
 * Uses `h.id ?? h.hero_id` defensively (assumption A1: field may be `id` or `hero_id`).
 * GUARD: skips entries where pro_pick === 0 (Pitfall 7 — division-by-zero protection).
 */
export function buildHeroStatsMap(raw: z.infer<typeof HeroStatsSchema>[]): HeroStatsMap {
  const map: HeroStatsMap = {}
  for (const h of raw) {
    const heroId = h.id ?? h.hero_id
    if (heroId === undefined) continue
    if (!h.pro_pick || h.pro_pick === 0) continue  // Pitfall 7: skip zero-pick heroes
    map[heroId] = {
      win_rate: (h.pro_win ?? 0) / h.pro_pick,
      pick_rate: h.pro_pick,
    }
  }
  return map
}

async function fetchHeroStats(): Promise<HeroStatsMap | null> {
  try {
    const res = await fetch(`${OPENDOTA_BASE}/heroStats`)
    if (!res.ok) {
      console.error(`[openDotaApi] heroStats fetch error: ${res.status} ${res.statusText}`)
      return null
    }
    const raw: unknown = await res.json()
    const parsed = z.array(HeroStatsSchema).safeParse(raw)
    if (!parsed.success) {
      console.error('[openDotaApi] HeroStatsSchema parse failure')
      return null
    }
    return buildHeroStatsMap(parsed.data)
  } catch (err) {
    console.error('[openDotaApi] Error fetching heroStats:', (err as Error).message)
    return null
  }
}

/**
 * Returns hero patch stats map cached 6h server-side.
 * Cache key: 'hero:stats' (D-13 — single global key, not per-hero).
 * Returns null when OpenDota is unreachable — badge strips will be hidden (D-03).
 */
export function getHeroStats(): Promise<HeroStatsMap | null> {
  return cached('hero:stats', TTL.HERO_STATS, fetchHeroStats)
}

// ─── Player Heroes ───────────────────────────────────────────────────────────

async function fetchPlayerHeroes(accountId: number): Promise<z.infer<typeof PlayerHeroSchema>[] | null> {
  try {
    const res = await fetch(`${OPENDOTA_BASE}/players/${accountId}/heroes`)
    if (!res.ok) {
      console.error(`[openDotaApi] Player heroes fetch error: ${res.status} ${res.statusText}`)
      return null
    }
    const raw: unknown = await res.json()
    const parsed = z.array(PlayerHeroSchema).safeParse(raw)
    if (!parsed.success) {
      console.error(`[openDotaApi] PlayerHeroSchema parse failure for account ${accountId}`)
      return null
    }
    return parsed.data
  } catch (err) {
    console.error(`[openDotaApi] Error fetching player heroes ${accountId}:`, (err as Error).message)
    return null
  }
}

/**
 * Returns player hero stats array cached 15min per accountId.
 * Cache key: 'player:heroes:{accountId}' (D-13).
 * SECURITY: never called for hidden profiles (account_id=4294967295) — caller guards via hiddenProfile().
 */
export function getPlayerHeroes(accountId: number): Promise<z.infer<typeof PlayerHeroSchema>[] | null> {
  return cached(`player:heroes:${accountId}`, TTL.PLAYER_STATS, () => fetchPlayerHeroes(accountId))
}

