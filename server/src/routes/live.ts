import { Hono } from 'hono'
import { getLiveLeagueGames, getLiveLeagueGamesFast } from '../services/valveApi.js'
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

/**
 * GET /api/live/draft/:matchId
 * Returns draft state (game_state + scoreboard) for a single live match.
 * Valve data cached TTL.DRAFT (4s) — 1 upstream call per 4s regardless of viewer count (D-16).
 * 404 if the match is not currently in the live-games payload.
 * 400 if matchId is not a finite number.
 * Response shape: { match_id, game_state, scoreboard }.
 *
 * Rationale (D-16): thin pass-through, NO league_name enrichment (MatchPage pulls
 * league_name via the separate useMatchDetail/live-games cache).
 *
 * SECURITY:
 *  - T-04-I1 (Input validation): matchId path param coerced via Number() + Number.isFinite()
 *    guard rejects non-numeric input before touching the cache or upstream.
 *  - T-04-D1 (DoS): cached('live_games:draft', TTL.DRAFT=4) coalesces N viewers to 1 upstream
 *    call per 4s. Client dynamic refetchInterval stops on game_state !== 2 (useDraftDetail).
 *  - T-04-I2 (Info leak): error responses return a constant string — no stack traces, no
 *    upstream error details, no Valve URL (contains API key).
 */
liveRoutes.get('/draft/:matchId', async (c) => {
  const rawMatchId = c.req.param('matchId')
  const parsedId = Number(rawMatchId)
  if (!Number.isFinite(parsedId)) {
    return c.json({ error: 'Invalid matchId' }, 400)
  }

  const data = await getLiveLeagueGamesFast()
  const game = data.result.games?.find((g) => g.match_id === parsedId)
  if (!game) {
    return c.json({ error: 'Match not live' }, 404)
  }

  return c.json({
    match_id: game.match_id,
    game_state: game.game_state,
    scoreboard: game.scoreboard,
  })
})

export default liveRoutes
