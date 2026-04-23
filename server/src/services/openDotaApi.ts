import { cached, TTL } from '../cache.js'
import { LeagueSchema } from '../schemas/openDota.js'

const OPENDOTA_BASE = 'https://api.opendota.com/api'

/**
 * Fetches league name from OpenDota /leagues/{leagueId}.
 * Returns null on any error (non-ok status, parse failure, null name).
 * SECURITY: T-02-01 — response validated with LeagueSchema.safeParse() before use.
 * SECURITY: T-02-02 — logs status/statusText only, never full URL.
 */
async function fetchLeagueName(leagueId: number): Promise<string | null> {
  let res: Response
  try {
    res = await fetch(`${OPENDOTA_BASE}/leagues/${leagueId}`)
  } catch (err) {
    console.error(`[openDotaApi] Network error fetching league ${leagueId}:`, (err as Error).message)
    return null
  }
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
