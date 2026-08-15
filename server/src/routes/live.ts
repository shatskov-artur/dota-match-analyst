import { Hono } from 'hono'
import { getLiveLeagueGames, getLiveLeagueGamesFast } from '../services/valveApi.js'
import { getPlayerHeroes } from '../services/openDotaApi.js'
import { applyKnownToPlay, rankCountersStratz } from '../services/intel.js'
import { getWinProbability, getHeroMatchupsStratz } from '../services/stratzApi.js'
import type { StratzHeroDryadEntry } from '../schemas/stratz.js'
import { hiddenProfile } from '../../../shared/hiddenProfile.js'
import { cached, TTL } from '../cache.js'
import { extractScoreboardInputs, computeGoldWinProb, computeEstWinProb } from '../services/winProbHeuristic.js'
import { enrichLiveGames } from '../services/liveAggregator.js'

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
  // v2.0: enrichment moved to services/liveAggregator.ts so the archive ingest can
  // persist byte-identical payloads. Behaviour here is unchanged.
  const enriched = await enrichLiveGames(games)
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

    // Valve sometimes ships game_state=2 with `players[].hero_id` populated but no
    // scoreboard at all (observed 2026-05-04). Without scoreboard the client's
    // DraftSection silently hides — even though picks have already happened.
    // Synthesize picks from top-level players when scoreboard is empty so users
    // at least see who picked what. Bans are only carried under scoreboard, so
    // they remain unavailable in this Valve window.
    const sb = game.scoreboard as Record<string, unknown> | undefined
    const sbRadiant = (sb?.radiant as Record<string, unknown> | undefined) ?? {}
    const sbDire = (sb?.dire as Record<string, unknown> | undefined) ?? {}
    const rPicks = (sbRadiant.picks as Array<Record<string, unknown>> | undefined) ?? []
    const dPicks = (sbDire.picks as Array<Record<string, unknown>> | undefined) ?? []

    let scoreboard: unknown = game.scoreboard
    if (rPicks.length === 0 && dPicks.length === 0) {
      const players = game.players ?? []
      const pickFromPlayer = (p: { hero_id?: number }) => ({ hero_id: p.hero_id })
      const synthRadiantPicks = players
        .filter((p) => p.team === 0 && typeof p.hero_id === 'number' && p.hero_id !== 0)
        .map(pickFromPlayer)
      const synthDirePicks = players
        .filter((p) => p.team === 1 && typeof p.hero_id === 'number' && p.hero_id !== 0)
        .map(pickFromPlayer)
      if (synthRadiantPicks.length > 0 || synthDirePicks.length > 0) {
        scoreboard = {
          ...(sb ?? {}),
          radiant: { ...sbRadiant, picks: synthRadiantPicks, bans: sbRadiant.bans ?? [] },
          dire: { ...sbDire, picks: synthDirePicks, bans: sbDire.bans ?? [] },
        }
      }
    }

    return c.json({
      match_id: game.match_id,
      game_state: game.game_state,
      scoreboard,
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

    // Extract picks from both teams (Pitfall 5: use scoreboard, not picks_bans)
    const radiantPicks = game.scoreboard?.radiant?.picks ?? []
    const direPicks = game.scoreboard?.dire?.picks ?? []
    const allPicks = [...radiantPicks, ...direPicks]

    // Players list from Valve payload — team 0 = Radiant, team 1 = Dire
    const players = (game.players ?? []).filter(
      p => p.team === 0 || p.team === 1
    )

    // Unique hero IDs — combine scoreboard picks with players[].hero_id so counters
    // remain available post-draft (Valve sometimes evicts scoreboard.*.picks after game_state→5).
    const uniqueHeroIds = [...new Set([
      ...allPicks.map(p => p.hero_id).filter((id): id is number => id !== undefined),
      ...players.map(p => p.hero_id).filter((id): id is number => id !== undefined && id > 0),
    ])]

    /**
     * The cache key has to move when its inputs move.
     *
     * Keyed on match id alone, whatever was computed FIRST was served for the next fifteen
     * minutes — and the first request lands during the draft, where Valve has not yet
     * attached heroes to players and every `players[].hero_id` is 0. The whole payload was
     * therefore filed under hero 0, so once the game started no portrait could find its own
     * intel and the hover card never appeared. The same staleness froze the counter list at
     * whichever picks existed on that first call.
     *
     * Signing the key with the heroes on the board and the number of players holding one
     * busts it exactly when the board changes and never otherwise. The expensive parts —
     * per-account hero histories and per-hero matchups — keep their own caches underneath,
     * so a recompute is mostly cache hits.
     */
    const assigned = players.filter(p => (p.hero_id ?? 0) > 0).length
    const heroSignature = `${[...uniqueHeroIds].sort((a, b) => a - b).join('.')}:${assigned}`

    // Outer cache: entire intel payload keyed by match_id + board state (not per-user — T-5-04).
    // shouldCache: the two allSettled fan-outs below deliberately keep whatever resolved, so a
    // Stratz or OpenDota outage produces a REAL but incomplete payload. Storing that for 15
    // minutes left hover cards half-empty long after the upstream came back, so an incomplete
    // payload is served once and not memoised.
    const payload = await cached(`intel:v3:${parsedId}:${heroSignature}`, TTL.PLAYER_STATS, async () => {
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

      // Whether every upstream actually answered. A rejection here is an outage, not an
      // absence — the payload below is still worth serving, but not worth remembering.
      const complete =
        matchupResults.every((r) => r.status === 'fulfilled') &&
        playerResults.every((r) => r.status === 'fulfilled')

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
          games: entry?.stats && entry.stats.games > 0 ? entry.stats.games : null,
          winRate: entry?.stats && entry.stats.games > 0
            ? entry.stats.win / entry.stats.games
            : null,
          counters: countersWithFlags,
        }
      })

      return { players: output, complete }
    }, { shouldCache: (p) => p.complete })

    // game_state must live OUTSIDE the 15-min cache — otherwise a stale game_state===2
    // would keep useMatchIntel polling forever past draft end.
    const sbRadiant = (game.scoreboard?.radiant as Record<string, unknown> | undefined)
    const hasInGamePlayers = Array.isArray(sbRadiant?.players) && (sbRadiant?.players as unknown[]).length > 0
    const derivedGameState = game.game_state ?? (hasInGamePlayers ? 5 : 2)

    // `complete` is a caching decision, not part of the client contract.
    const { complete: _complete, ...body } = payload
    return c.json({ ...body, game_state: derivedGameState })
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
