import { cached, TTL } from '../cache.js'
import { valveQueue } from '../queues.js'
import { parseRetryAfter } from './retryAfter.js'
import { LiveLeagueGamesSchema, type LiveLeagueGames } from '../schemas/valve.js'
import { LeagueDataSchema, type LeagueData } from '../schemas/leagueData.js'
import { env } from '../env.js'

const STEAM_API_BASE = 'https://api.steampowered.com'
// Separate host and no API key: the league/bracket data lives on the storefront web API,
// not on api.steampowered.com. Undocumented but keyless, verified against TI 2026.
const DOTA2_WEBAPI_BASE = 'https://www.dota2.com/webapi'

async function fetchLiveLeagueGames(): Promise<LiveLeagueGames> {
  // SECURITY: T-04-04 — log status/statusText only, never log the full URL (contains API key)
  const url = `${STEAM_API_BASE}/IDOTA2Match_570/GetLiveLeagueGames/v1/?key=${env.VALVE_API_KEY}&partner=1`
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) {
    // 429 → throw a retryable rate-limit error so cached()'s pRetry backs off (status/retryAfterMs only).
    if (res.status === 429) {
      throw Object.assign(new Error('Valve API 429'), { status: 429, retryAfterMs: parseRetryAfter(res) })
    }
    throw new Error(`Valve API error: ${res.status} ${res.statusText}`)
  }
  const raw: unknown = await res.json()
  // .parse() throws ZodError on unexpected shape — surfaces schema drift immediately (T-04-02)
  return LiveLeagueGamesSchema.parse(raw)
}

/**
 * Returns live league games from Valve's GetLiveLeagueGames endpoint.
 * Result is cached for TTL.LIVE_MATCH (30s) — N concurrent viewers → 1 upstream call.
 * Per CLAUDE.md: cached() is the ONLY path to upstream. Never call fetchLiveLeagueGames directly.
 * T-04-03: cached() ensures 1 upstream call per 30s regardless of client polling rate.
 */
export function getLiveLeagueGames(): Promise<LiveLeagueGames> {
  return cached('live_games', TTL.LIVE_MATCH, fetchLiveLeagueGames, { queue: valveQueue, upstream: 'valve' })
}

/**
 * Returns live league games from Valve for the DRAFT fast lane (Phase 4 D-16).
 * Result is cached for TTL.DRAFT (4s) — 1 upstream call per 4s regardless of client polling rate.
 * CRITICAL: distinct cache key 'live_games:draft' does NOT share with the 30s 'live_games' key,
 * so populating this lane does NOT evict the 30s cache serving HomePage.
 * Shares the same upstream fetchLiveLeagueGames() — DRAFT adds a cache dimension, not a new upstream path.
 * Per CLAUDE.md: cached() is the ONLY path to upstream. Never call fetchLiveLeagueGames directly.
 */
export function getLiveLeagueGamesFast(): Promise<LiveLeagueGames> {
  return cached('live_games:draft', TTL.DRAFT, fetchLiveLeagueGames, { queue: valveQueue, upstream: 'valve' })
}

// ─── League / bracket data (v2.0) ────────────────────────────────────────────

async function fetchLeagueData(leagueId: number): Promise<LeagueData | null> {
  const url = `${DOTA2_WEBAPI_BASE}/IDOTA2League/GetLeagueData/v001/?league_id=${leagueId}`
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    if (res.status === 429) {
      throw Object.assign(new Error('dota2.com webapi 429'), { status: 429, retryAfterMs: parseRetryAfter(res) })
    }
    // Thrown rather than returned as null: cached() would have stored the null for the
    // full 5-minute TTL, so a single blip froze the bracket for five minutes AFTER Valve
    // had recovered. syncLeagues() already wraps every league in its own try/catch, so
    // the ingest tick survives this exactly as before — it just does not memoise it.
    console.error(`[valveApi] GetLeagueData error: ${res.status} ${res.statusText}`)
    throw Object.assign(new Error(`GetLeagueData unavailable: ${res.status} ${res.statusText}`), {
      status: res.status,
    })
  }
  const raw: unknown = await res.json()
  // .safeParse, not .parse: this endpoint carries no contract, and a shape surprise
  // mid-tournament must degrade the bracket, never take the ingest tick down with it.
  const parsed = LeagueDataSchema.safeParse(raw)
  if (!parsed.success) {
    console.error(`[valveApi] LeagueDataSchema parse failure for league ${leagueId}`)
    return null
  }
  return parsed.data
}

/**
 * Tournament structure: bracket nodes, schedule, standings, streams.
 * Cached 5 min — the tree only moves when a series finishes, and tournamentSync
 * ticks at the same cadence.
 *
 * Returns null when the endpoint is unreachable or reshapes; callers keep whatever
 * they already persisted rather than wiping the bracket.
 */
export function getLeagueData(leagueId: number): Promise<LeagueData | null> {
  return cached(`league_data:${leagueId}`, TTL.LEAGUE_DATA, () => fetchLeagueData(leagueId), {
    queue: valveQueue,
    upstream: 'dota2-webapi',
  })
}
