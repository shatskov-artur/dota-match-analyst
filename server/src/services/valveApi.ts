import { cached, TTL } from '../cache.js'
import { LiveLeagueGamesSchema, type LiveLeagueGames } from '../schemas/valve.js'
import { env } from '../env.js'

const STEAM_API_BASE = 'https://api.steampowered.com'

async function fetchLiveLeagueGames(): Promise<LiveLeagueGames> {
  // SECURITY: T-04-04 — log status/statusText only, never log the full URL (contains API key)
  const url = `${STEAM_API_BASE}/IDOTA2Match_570/GetLiveLeagueGames/v1/?key=${env.VALVE_API_KEY}&partner=1`
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) {
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
  return cached('live_games', TTL.LIVE_MATCH, fetchLiveLeagueGames)
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
  return cached('live_games:draft', TTL.DRAFT, fetchLiveLeagueGames)
}
