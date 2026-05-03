import { Hono } from 'hono'
import { getLiveLeagueGames, getLiveLeagueGamesFast } from '../services/valveApi.js'
import { getLeagueName, getPlayerHeroes } from '../services/openDotaApi.js'
import { applyKnownToPlay, rankCountersStratz } from '../services/intel.js'
import { getWinProbability, getHeroMatchupsStratz } from '../services/stratzApi.js'
import type { StratzHeroDryadEntry } from '../schemas/stratz.js'
import { hiddenProfile } from '../../../shared/hiddenProfile.js'
import { cached, TTL } from '../cache.js'
import { extractScoreboardInputs, computeGoldWinProb, computeEstWinProb } from '../services/winProbHeuristic.js'
import { detectRoshanKill, readRoshanState, writeRoshanState } from '../services/roshanState.js'
import { lookupRoshanLoot } from '../../../shared/roshanLoot.js'
import { logger } from '../logger.js'

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
  let data: Awaited<ReturnType<typeof getLiveLeagueGames>>
  try {
    data = await getLiveLeagueGames()
  } catch (err) {
    console.error('[live] getLiveLeagueGames failed:', (err as Error).message)
    return c.json({ error: 'upstream_unavailable' }, 503)
  }
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

  const enriched = await Promise.all(games.map(async (g) => {
    // Valve puts combat stats in scoreboard.{radiant,dire}.players[], NOT in top-level players[].
    // Top-level players[] only carries: account_id, hero_id, name, team.
    // Merge scoreboard stats into top-level players so downstream components read one array.
    const sbRadiant = (g.scoreboard?.radiant as Record<string, unknown> | undefined)
    const sbDire = (g.scoreboard?.dire as Record<string, unknown> | undefined)

    // Valve omits game_state and duration at top level (observed 2026-04-26 — field moved to scoreboard).
    // Infer game_state: scoreboard.radiant.players[] present → in-game (5); else draft (2).
    const hasInGamePlayers = Array.isArray(sbRadiant?.players) && (sbRadiant?.players as unknown[]).length > 0
    const derivedGameState = g.game_state ?? (hasInGamePlayers ? 5 : 2)
    // Derive duration from scoreboard.duration when absent at top level.
    const sb = g.scoreboard as Record<string, unknown> | undefined
    const sbDuration = typeof sb?.duration === 'number' ? sb.duration as number : undefined
    const sbRoshanTimer = typeof sb?.roshan_respawn_timer === 'number' ? sb.roshan_respawn_timer as number : undefined
    const sbPlayers = [
      ...((sbRadiant?.players as unknown[]) ?? []),
      ...((sbDire?.players as unknown[]) ?? []),
    ] as Array<Record<string, unknown>>

    const statsByAccountId = new Map<number, Record<string, unknown>>()
    for (const sp of sbPlayers) {
      if (typeof sp.account_id === 'number') {
        statsByAccountId.set(sp.account_id, sp)
      }
    }

    const players = (g.players ?? []).map((p) => {
      const stats = p.account_id !== undefined ? statsByAccountId.get(p.account_id) : undefined
      if (!stats) return p
      return {
        ...p,
        kills: stats.kills ?? p.kills,
        death: stats.death ?? p.death,
        assists: stats.assists ?? p.assists,
        net_worth: stats.net_worth ?? p.net_worth,
        level: stats.level ?? p.level,
        respawn_timer: stats.respawn_timer ?? p.respawn_timer,
        gpm: stats.gold_per_min ?? p.gpm,
        xpm: stats.xp_per_min ?? p.xpm,
        lh: stats.last_hits ?? p.lh,
        dn: stats.denies ?? p.dn,
        item0: stats.item0 ?? p.item0,
        item1: stats.item1 ?? p.item1,
        item2: stats.item2 ?? p.item2,
        item3: stats.item3 ?? p.item3,
        item4: stats.item4 ?? p.item4,
        item5: stats.item5 ?? p.item5,
        item_neutral: stats.item_neutral ?? p.item_neutral,
        item6: stats.item6 ?? p.item6,
        item7: stats.item7 ?? p.item7,
        item8: stats.item8 ?? p.item8,
        // Phase 8 fields — surface scoreboard position + ultimate state into top-level players[]
        position_x: stats.position_x ?? p.position_x,
        position_y: stats.position_y ?? p.position_y,
        ultimate_state: stats.ultimate_state ?? p.ultimate_state,
        ultimate_cooldown: stats.ultimate_cooldown ?? p.ultimate_cooldown,
      }
    })

    // Phase 9 Roshan: read prev state → detect → conditionally write
    let roshan: { killCount: number; alive: boolean; respawnIn: number | null; lastKillLoot: number[] | null } | null = null
    if (typeof g.match_id === 'number') {
      const matchId = g.match_id
      const prevState = await readRoshanState(matchId)
      const gameTime = sbDuration ?? g.duration ?? 0
      const { state: nextState, killed } = detectRoshanKill(
        prevState,
        sbRoshanTimer,
        gameTime,
        Date.now(),
      )
      const stateChanged = !prevState
        || prevState.killCount !== nextState.killCount
        || prevState.prevTimer !== nextState.prevTimer
      if (stateChanged && (killed || sbRoshanTimer !== undefined)) {
        await writeRoshanState(matchId, nextState)
      }
      if (killed) {
        logger.info(
          {
            matchId,
            killNumber: nextState.killCount,
            prevTimer: prevState?.prevTimer ?? 0,
            curTimer: sbRoshanTimer ?? 0,
          },
          'roshan kill detected',
        )
      }
      if (nextState.killCount > 0 || sbRoshanTimer !== undefined) {
        roshan = {
          killCount: nextState.killCount,
          alive: (sbRoshanTimer ?? 0) === 0,
          respawnIn: (sbRoshanTimer ?? 0) > 0 ? sbRoshanTimer ?? null : null,
          lastKillLoot: nextState.killCount > 0 ? Array.from(lookupRoshanLoot(nextState.killCount)) : null,
        }
      }
    }

    return {
      ...g,
      game_state: derivedGameState,
      duration: g.duration ?? sbDuration,
      roshan_respawn_timer: sbRoshanTimer,
      roshan,
      players,
      league_name: nameMap[g.league_id] ?? `League #${g.league_id}`,
    }
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

  try {
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
  } catch {
    return c.json({ error: 'Upstream error' }, 502)
  }
})

/**
 * GET /api/live/intel/:matchId
 * Returns combined intel for a live match: per-player hero stats + per-pick counterpicks
 * with "known to play" flags pre-computed server-side (D-09).
 *
 * URL derivation: liveRoutes mounted at /api/live → liveRoutes.get('/intel/:matchId') → /api/live/intel/:matchId
 *
 * Two-level caching:
 *  1. Outer: cached('intel:{matchId}', TTL.PLAYER_STATS=15min) — N viewers = 1 call per 15min
 *  2. Inner: getPlayerHeroes(accountId) cached per-player at TTL.PLAYER_STATS
 *            getHeroMatchupsStratz(heroId) cached per-hero at TTL.HERO_STATS (6h)
 *
 * Response shape: {
 *   players: Array<{
 *     accountId: number,
 *     heroId: number,
 *     playerName: string,
 *     games: number | null,       // null = hidden profile
 *     winRate: number | null,     // null = hidden profile
 *     counters: Array<{
 *       heroId: number,
 *       knownPlayers: string[]    // opposing player names who meet D-09 threshold
 *     }>
 *   }>
 * }
 *
 * SECURITY:
 *  - T-5-01: matchId validated via Number.isFinite() — 400 on non-numeric input.
 *  - T-5-02: outer try/catch returns opaque 502 — no upstream details.
 *  - T-5-03: all OpenDota responses parsed via .safeParse() in service layer.
 *  - T-5-04: cache key is intel:{matchId} — not per-user.
 */
liveRoutes.get('/intel/:matchId', async (c) => {
  const rawMatchId = c.req.param('matchId')
  const parsedId = Number(rawMatchId)
  if (!Number.isFinite(parsedId)) {
    return c.json({ error: 'Invalid matchId' }, 400)
  }

  try {
    // Read live game from fast cache (TTL.DRAFT = 4s) — no new Valve API call
    const data = await getLiveLeagueGamesFast()
    const game = data.result.games?.find((g) => g.match_id === parsedId)
    if (!game) return c.json({ error: 'Match not live' }, 404)

    // Outer cache: entire intel payload keyed by match_id (not per-user — T-5-04)
    const payload = await cached(`intel:${parsedId}`, TTL.PLAYER_STATS, async () => {
      // Extract picks from both teams (Pitfall 5: use scoreboard, not picks_bans)
      const radiantPicks = game.scoreboard?.radiant?.picks ?? []
      const direPicks = game.scoreboard?.dire?.picks ?? []
      const allPicks = [...radiantPicks, ...direPicks]

      // Unique hero IDs across all picks (for matchup fetching)
      const uniqueHeroIds = [...new Set(
        allPicks.map(p => p.hero_id).filter((id): id is number => id !== undefined)
      )]

      // Players list from Valve payload — team 0 = Radiant, team 1 = Dire
      const players = (game.players ?? []).filter(
        p => p.team === 0 || p.team === 1
      )

      // Batch fetch: all hero matchups + all player full hero histories concurrently
      const [matchupResults, playerResults] = await Promise.all([
        // Hero matchups (6h cached per hero) — one per unique picked hero
        Promise.allSettled(
          uniqueHeroIds.map(heroId => getHeroMatchupsStratz(heroId))
        ),
        // Player hero histories (15min cached per account) — hidden profiles short-circuited
        // Store FULL hero list (not just current pick) for "known to play" cross-reference (D-09)
        Promise.allSettled(
          players.map(async (p) => {
            const accountId = p.account_id ?? 0
            const heroId = p.hero_id ?? 0
            if (!accountId || hiddenProfile(accountId)) {
              return {
                accountId,
                heroId,
                playerName: p.name ?? '',
                stats: null,
                fullHeroList: [] as Array<{ hero_id?: string | number; games?: number; win?: number }>,
              }
            }
            const heroes = await getPlayerHeroes(accountId)
            const heroEntry = heroes?.find(h => Number(h.hero_id) === heroId) ?? null
            return {
              accountId,
              heroId,
              playerName: p.name ?? '',
              stats: heroEntry
                ? { games: heroEntry.games ?? 0, win: heroEntry.win ?? 0 }
                : null,
              fullHeroList: heroes ?? [],  // full history for "known to play" cross-reference (D-09)
            }
          })
        ),
      ])

      // Build matchup lookup: heroId → ranked counters
      const matchupByHero = new Map<number, ReturnType<typeof rankCountersStratz>>()
      uniqueHeroIds.forEach((heroId, idx) => {
        const result = matchupResults[idx]
        if (result.status === 'fulfilled' && result.value) {
          matchupByHero.set(heroId, rankCountersStratz(result.value as StratzHeroDryadEntry[]))
        }
      })

      // Build player lookup: accountId → { stats, fullHeroList, playerName }
      type PlayerEntry = {
        accountId: number
        heroId: number
        playerName: string
        stats: { games: number; win: number } | null
        fullHeroList: Array<{ hero_id?: string | number; games?: number; win?: number }>
      }
      const playerEntryMap = new Map<number, PlayerEntry>()
      for (const r of playerResults) {
        if (r.status === 'fulfilled') {
          playerEntryMap.set(r.value.accountId, r.value)
        }
      }

      // Compute per-pick output — match players to their picks via hero_id
      const output = players.map((p) => {
        const accountId = p.account_id ?? 0
        const heroId = p.hero_id ?? 0
        const teamId = p.team ?? 0  // 0=Radiant, 1=Dire
        const entry = playerEntryMap.get(accountId)
        const counters = matchupByHero.get(heroId) ?? []

        // D-09: for each counter hero, find opposing players who are "known to play" it
        const opposingTeamId = teamId === 0 ? 1 : 0
        const opposingPlayers = players.filter(op => op.team === opposingTeamId)

        const countersWithFlags = counters.map(counter => {
          const knownPlayers: string[] = []
          for (const op of opposingPlayers) {
            const opAccountId = op.account_id ?? 0
            const opEntry = playerEntryMap.get(opAccountId)
            if (!opEntry) continue
            // Use full hero history to find the counter hero in the opposing player's history
            const opHeroEntry = opEntry.fullHeroList.find(
              h => Number(h.hero_id) === counter.heroId
            )
            // D-09 threshold: games >= 10 AND win/games > 0.5 (applyKnownToPlay enforces this)
            if (opHeroEntry && applyKnownToPlay(opHeroEntry)) {
              knownPlayers.push(op.name ?? `Player ${opAccountId}`)
            }
          }
          return { heroId: counter.heroId, knownPlayers }
        })

        return {
          accountId,
          heroId,
          playerName: entry?.playerName ?? p.name ?? '',
          games: entry?.stats?.games ?? null,
          winRate: entry?.stats
            ? (entry.stats.games > 0 ? entry.stats.win / entry.stats.games : 0)
            : null,
          counters: countersWithFlags,
        }
      })

      return { players: output }
    })

    return c.json(payload)
  } catch {
    return c.json({ error: 'Upstream error' }, 502)
  }
})

/**
 * GET /api/live/winprob/:matchId
 * Returns win probability for a live match from Stratz (optional) and heuristic sources.
 * Response includes gameState and duration so the client hook can compute refetchInterval
 * without a separate useMatchDetail read.
 *
 * SECURITY:
 *  - T-6-03: matchId path param validated via Number.isFinite() → 400 on non-numeric.
 *  - T-6-04: Stratz errors are caught by getWinProbability (returns null) — no Stratz details forwarded.
 *  - T-6-07: heuristic computed before return; outer catch returns opaque 502 — no new info exposed.
 */
liveRoutes.get('/winprob/:matchId', async (c) => {
  const rawMatchId = c.req.param('matchId')
  const parsedId = Number(rawMatchId)
  if (!Number.isFinite(parsedId)) {
    return c.json({ error: 'Invalid matchId' }, 400)
  }
  try {
    const [winProb, data] = await Promise.all([
      getWinProbability(parsedId),
      getLiveLeagueGamesFast(),
    ])
    const game = data.result.games?.find((g) => g.match_id === parsedId)
    const sbRadiant = (game?.scoreboard?.radiant as Record<string, unknown> | undefined)
    const hasPlayers = Array.isArray(sbRadiant?.players) && (sbRadiant?.players as unknown[]).length > 0
    const sbDuration = typeof (game?.scoreboard as Record<string, unknown> | undefined)?.duration === 'number'
      ? (game?.scoreboard as Record<string, unknown>).duration as number
      : null

    // Heuristic inputs — always computable from Valve data; returns zeros when game absent
    const inputs = extractScoreboardInputs(game as Record<string, unknown> | undefined)
    const gold = computeGoldWinProb(inputs.goldDiff)
    const estimate = computeEstWinProb(inputs)

    return c.json({
      stratz: winProb,                                      // null when Stratz doesn't track match
      gold,                                                  // always a number ∈ [0.05, 0.95]
      estimate,                                              // always a number ∈ [0.05, 0.95]
      gameState: game?.game_state ?? (hasPlayers ? 5 : null),
      duration: game?.duration ?? sbDuration,
    })
  } catch {
    return c.json({ error: 'Upstream error' }, 502)
  }
})

export default liveRoutes
