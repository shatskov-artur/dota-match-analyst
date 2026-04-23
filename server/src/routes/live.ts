import { Hono } from 'hono'
import { getLiveLeagueGames } from '../services/valveApi.js'
import { getLeagueName } from '../services/openDotaApi.js'

const liveRoutes = new Hono()

/**
 * GET /api/live/games
 * Returns all live league matches enriched with league_name from OpenDota.
 * Valve data cached 30s; league names cached 6h server-side by league_id.
 * Response shape: { games: EnrichedLiveGame[] }
 *
 * SECURITY: T-02-02 — Valve API key never logged (valveApi.ts handles this).
 * SECURITY: T-02-01 — OpenDota response validated via LeagueSchema.safeParse() in openDotaApi.ts.
 */
liveRoutes.get('/games', async (c) => {
  const data = await getLiveLeagueGames()
  const games = data.result.games ?? []

  // De-duplicate league IDs before fetching to minimise upstream calls
  const uniqueLeagueIds = [...new Set(games.map((g) => g.league_id))]

  // Fetch all league names concurrently — each individually cached 6h
  const nameEntries = await Promise.all(
    uniqueLeagueIds.map(async (id) => {
      const name = await getLeagueName(id)
      // D-08: fallback label when OpenDota returns null or unknown league
      return [id, name ?? `League #${id}`] as const
    }),
  )
  const nameMap = Object.fromEntries(nameEntries)

  const enriched = games.map((g) => ({
    ...g,
    league_name: nameMap[g.league_id] ?? `League #${g.league_id}`,
  }))

  return c.json({ games: enriched })
})

export default liveRoutes
