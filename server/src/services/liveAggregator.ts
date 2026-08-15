import { getLeagueInfo } from './openDotaApi.js'
import { peekTeamLogo, warmTeamLogo, teamRef } from './teamLogo.js'
import { detectRoshanKill, readRoshanState, writeRoshanState } from './roshanState.js'
import { recoverRoshanState } from './archive/roshanHistory.js'
import { readHistory, tryWriteSample, deleteHistory, buildSample } from './historySampler.js'
import type { HistorySample } from '../schemas/bff.js'
import { lookupRoshanLoot } from '../../../shared/roshanLoot.js'
import { packBuildingState } from '../../../shared/buildingDecoder.js'
import type { LiveLeagueGames } from '../schemas/valve.js'
import { logger } from '../logger.js'

// Extracted verbatim from routes/live.ts GET /games (Phase 2–10 behaviour) so that the
// v2.0 ingest job can archive exactly the payload a viewer would have seen at that moment.
// That equivalence is what lets /api/matches/:id/at?minute=N feed the unchanged MatchPage.
//
// Callers: routes/live.ts (per request) and services/ingest/ingestJob.ts (per 30s tick).
// Both read through cached('live_games', 30s), so this does not double Valve traffic.

export type ValveGames = NonNullable<LiveLeagueGames['result']['games']>
export type ValveGame = ValveGames[number]

export interface EnrichedLiveGame extends Record<string, unknown> {
  match_id?: number
  league_id?: number
  game_state?: number
  duration?: number
  league_name: string
  /** OpenDota tier name: 'premium' | 'professional' | 'amateur' | null when unknown. */
  league_tier: string | null
  history: HistorySample[]
  roshan: {
    killCount: number
    alive: boolean
    respawnIn: number | null
    lastKillLoot: number[] | null
    /** Every Roshan of this match: which number it was, at what game second, and its drop. */
    kills: Array<{ n: number; gameTime: number; loot: number[] }>
  } | null
  team_logos: { radiant: string | null; dire: string | null }
}

/**
 * Valve omits game_state at the top level (observed 2026-04-26 — the field moved into
 * scoreboard). Infer it: scoreboard.radiant.players[] present → in-game (5), else draft (2).
 * Duplicated logic also lives in ingestJob.deriveGameState for the pre-enrichment filter.
 */
export function deriveGameState(g: ValveGame): number {
  const sbRadiant = g.scoreboard?.radiant as Record<string, unknown> | undefined
  const hasInGamePlayers = Array.isArray(sbRadiant?.players) && (sbRadiant?.players as unknown[]).length > 0
  return g.game_state ?? (hasInGamePlayers ? 5 : 2)
}

export async function enrichLiveGames(games: ValveGames): Promise<EnrichedLiveGame[]> {
  // De-duplicate league IDs before fetching to minimise upstream calls
  const uniqueLeagueIds = [...new Set(games.map((g) => g.league_id))]

  // Fetch all league info concurrently — each individually cached 6h. Name AND tier come
  // from the same call, so surfacing the tier costs nothing: it was already being fetched
  // and discarded.
  // The catch is HERE rather than inside getLeagueInfo: a transient OpenDota failure now
  // throws so that cached() stores nothing (see openDotaApi.upstreamFailure), and this
  // response degrades to the fallback label for one poll instead of pinning "League #123"
  // into Redis for the next six hours.
  const infoEntries = await Promise.all(
    uniqueLeagueIds.map(async (id) => {
      const info = await getLeagueInfo(id).catch(() => null)
      // D-08: fallback label when OpenDota returns null or unknown league
      return [id, { name: info?.name ?? `League #${id}`, tier: info?.tier ?? null }] as const
    }),
  )
  const infoMap = Object.fromEntries(infoEntries)

  // Team logos: de-duplicated across the whole payload (~20 matches → at most ~40 unique teams,
  // and both sides of a rematch share one entry). Read from the cache only — a team that has
  // never been resolved is warmed in the background and shows a monogram until the next poll.
  // Blocking here would put the 2 req/s OpenDota queue between the user and the match list.
  const logoRefs = new Map<string, NonNullable<ReturnType<typeof teamRef>>>()
  for (const g of games) {
    for (const team of [g.radiant_team, g.dire_team]) {
      const ref = teamRef(team)
      if (ref && !logoRefs.has(ref.key)) logoRefs.set(ref.key, ref)
    }
  }
  const logoEntries = await Promise.all(
    [...logoRefs.values()].map(async (ref) => {
      const hit = await peekTeamLogo(ref)
      if (hit === undefined) {
        warmTeamLogo(ref)
        return [ref.key, null] as const
      }
      return [ref.key, hit] as const
    }),
  )
  const logoMap = Object.fromEntries(logoEntries)
  const logoFor = (team?: { team_id?: number; team_logo?: string | number }): string | null => {
    const ref = teamRef(team)
    return ref ? logoMap[ref.key] ?? null : null
  }

  return Promise.all(
    games.map(async (g) => {
      // Valve puts combat stats in scoreboard.{radiant,dire}.players[], NOT in top-level players[].
      // Top-level players[] only carries: account_id, hero_id, name, team.
      // Merge scoreboard stats into top-level players so downstream components read one array.
      const sbRadiant = g.scoreboard?.radiant as Record<string, unknown> | undefined
      const sbDire = g.scoreboard?.dire as Record<string, unknown> | undefined

      const derivedGameState = deriveGameState(g)
      // Derive duration from scoreboard.duration when absent at top level.
      const sb = g.scoreboard as Record<string, unknown> | undefined
      const sbDuration = typeof sb?.duration === 'number' ? (sb.duration as number) : undefined
      const sbRoshanTimer =
        typeof sb?.roshan_respawn_timer === 'number' ? (sb.roshan_respawn_timer as number) : undefined
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
      let roshan: EnrichedLiveGame['roshan'] = null
      if (typeof g.match_id === 'number') {
        const matchId = g.match_id
        // Redis first; the archive as the fallback. Without the second half a restart in
        // the middle of a match began counting Roshans again from one, and the loot table
        // beside the counter — which is picked BY kill number — advertised the wrong drop
        // for the rest of the game.
        const prevState = (await readRoshanState(matchId)) ?? (await recoverRoshanState(matchId))
        const gameTime = sbDuration ?? g.duration ?? 0
        const { state: nextState, killed } = detectRoshanKill(prevState, sbRoshanTimer, gameTime, Date.now())
        // Write only on meaningful transitions, not on every timer tick:
        //   - first observation (no prev state at all)
        //   - kill detected (killCount changed)
        //   - respawn boundary crossed (prev>0 → cur=0): we need to clear prevTimer so the
        //     NEXT kill (cur 0 → >0) is detectable
        const crossedRespawnBoundary = !!prevState && prevState.prevTimer > 0 && nextState.prevTimer === 0
        const shouldWrite = !prevState || killed || crossedRespawnBoundary
        if (shouldWrite && sbRoshanTimer !== undefined) {
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
            /*
             * Every Roshan of the match, not just the count.
             *
             * The kill log was being kept in Redis all along and never left the server, so
             * the page could say "Roshan ×3" but not WHEN any of them died — and the timing
             * is most of the meaning: a Roshan at 18:00 and a Roshan at 41:00 are different
             * facts about a game. Each entry carries its number and the game second, and
             * the loot for that number is resolved here so the client keeps no copy of the
             * drop table.
             */
            kills: nextState.kills.map((k) => ({
              n: k.n,
              gameTime: k.gameTime,
              loot: Array.from(lookupRoshanLoot(k.n)),
            })),
          }
        }
      }

      // Phase 10: history sampler — fire-and-forget piggyback (D-05, D-09).
      // MUST NOT throw. MUST run AFTER derivedGameState is computed.
      let history: HistorySample[] = []
      if (typeof g.match_id === 'number') {
        const matchId = g.match_id
        try {
          if (derivedGameState === 6) {
            // D-13: explicit cleanup on post-game observation
            await deleteHistory(matchId)
          } else if (derivedGameState === 5) {
            const sample = buildSample({
              scoreboard: g.scoreboard as never,
              duration: g.duration,
              game_state: derivedGameState,
            })
            if (sample) {
              const wrote = await tryWriteSample(matchId, sample)
              if (wrote) {
                logger.info({ matchId, t: sample.t, gold: sample.gold, xp: sample.xp }, 'history sample written')
              }
            }
          }
          history = await readHistory(matchId)
        } catch (err) {
          // D-09: fire-and-forget — never break the live response
          logger.error({ matchId, err: (err as Error).message }, 'history sampler failed')
        }
      }

      // Buildings: Valve carries tower_state / barracks_state PER TEAM under
      // scoreboard.{radiant,dire} and leaves the top level undefined, but
      // shared/buildingDecoder expects the packed layout (lower 16 bits Radiant,
      // upper 16 Dire; rax lower 8 / upper 8). Without this packing
      // useMatchDetail's buildingDecoder(match.tower_state, …) receives undefined
      // and reports every building alive for the whole match. Pack it here, once,
      // where both halves are in scope.
      const asNum = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
      const { towerState: packedTowers, barracksState: packedRax } = packBuildingState(
        asNum(sbRadiant?.tower_state),
        asNum(sbDire?.tower_state),
        asNum(sbRadiant?.barracks_state),
        asNum(sbDire?.barracks_state),
      )

      return {
        ...g,
        game_state: derivedGameState,
        duration: g.duration ?? sbDuration,
        tower_state: packedTowers,
        barracks_state: packedRax,
        roshan_respawn_timer: sbRoshanTimer,
        roshan,
        players,
        league_name: infoMap[g.league_id]?.name ?? `League #${g.league_id}`,
        /** OpenDota tier name — drives the home page's tier filter. Null when unknown. */
        league_tier: infoMap[g.league_id]?.tier ?? null,
        team_logos: {
          radiant: logoFor(g.radiant_team),
          dire: logoFor(g.dire_team),
        },
        history,
      } as EnrichedLiveGame
    }),
  )
}
