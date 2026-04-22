import { Hono } from 'hono'
import { getLiveLeagueGames } from '../services/valveApi.js'

const liveRoutes = new Hono()

/**
 * GET /api/live/games
 * Returns all live league (tournament) matches from Valve's GetLiveLeagueGames.
 * Cached for 30s server-side — N viewers produce 1 upstream call per TTL.
 */
liveRoutes.get('/games', async (c) => {
  const data = await getLiveLeagueGames()
  return c.json(data)
})

export default liveRoutes
