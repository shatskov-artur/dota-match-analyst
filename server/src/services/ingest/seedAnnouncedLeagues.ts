import { inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { leagues } from '../../db/schema.js'
import { getAllLeagues } from '../openDotaApi.js'
import { getLeagueData } from '../valveApi.js'
import { archivedLeagueTiers } from '../../env.js'
import { logger, briefError } from '../../logger.js'

/**
 * Learn about a tournament BEFORE its first match is ever played.
 *
 * getLeaguesOfInterest follows anything already in the `leagues` table, and a tournament
 * earns its row the first time one of its games appears in the live feed. That covers the
 * whole life of an event except its beginning: between "announced, bracket published" and
 * "first game starts" the app has no idea it exists, so the fixtures nobody can see yet are
 * exactly the ones a schedule page is for.
 *
 * The gap was closable by hand — add the id to TRACKED_LEAGUE_IDS — and the owner asked for
 * precisely that not to be necessary: "so it pulls those ids automatically, rather than me
 * asking for code changes".
 *
 * HOW, WITHOUT BOILING THE OCEAN
 * OpenDota's keyless catalogue lists every league ever registered, with its tier — thousands
 * of rows, no dates. Valve's GetLeagueData has the dates but needs an id. So: take the
 * catalogue, keep only the tiers being recorded, drop everything already in the archive, and
 * probe the highest ids — league ids increase monotonically, so the newest registrations are
 * the ones that could still be upcoming. A row is seeded only when the bracket actually
 * carries a fixture in the future, which is what distinguishes an announced tournament from
 * an abandoned template.
 *
 * Runs once a day and probes at most PROBE_BUDGET leagues, so the whole feature costs one
 * catalogue fetch plus a handful of keyless calls per day.
 */

/** How many unknown leagues one pass may ask Valve about. */
export const PROBE_BUDGET = 15

/** A fixture this far ahead is proof the tournament is real and still to come. */
const HORIZON_DAYS = 45

export interface SeedResult {
  probed: number
  seeded: number[]
}

export async function seedAnnouncedLeagues(
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<SeedResult> {
  const result: SeedResult = { probed: 0, seeded: [] }
  if (!db) return result

  let catalogue: Awaited<ReturnType<typeof getAllLeagues>>
  try {
    catalogue = await getAllLeagues()
  } catch (err) {
    // Nothing downstream depends on this succeeding; the app simply learns about the
    // tournament a little later, when its first match goes live.
    logger.warn({ err: briefError(err) }, 'seed: leagues catalogue unavailable')
    return result
  }
  if (!catalogue || catalogue.length === 0) return result

  const wanted = catalogue.filter((l) => archivedLeagueTiers.has((l.tier ?? '').trim().toLowerCase()))
  if (wanted.length === 0) return result

  // Newest first. Ids are assigned in order, so a tournament that has not started yet is
  // near the top of this list and an event from 2019 is nowhere near it.
  wanted.sort((a, b) => b.leagueid - a.leagueid)
  const shortlist = wanted.slice(0, PROBE_BUDGET * 4).map((l) => l.leagueid)

  // Anything the archive already knows is followed by getLeaguesOfInterest; probing it here
  // would spend the budget re-learning what we have.
  let known: Set<number>
  try {
    const rows = await db
      .select({ leagueId: leagues.leagueId })
      .from(leagues)
      .where(inArray(leagues.leagueId, shortlist))
    known = new Set(rows.map((r) => r.leagueId))
  } catch (err) {
    logger.warn({ err: briefError(err) }, 'seed: could not read known leagues')
    return result
  }

  const unknown = shortlist.filter((id) => !known.has(id)).slice(0, PROBE_BUDGET)
  const horizon = nowSeconds + HORIZON_DAYS * 86_400

  for (const leagueId of unknown) {
    result.probed++
    try {
      const data = await getLeagueData(leagueId)
      if (!data) continue

      // A published fixture in the future is the evidence. Valve keeps abandoned bracket
      // templates around forever with scheduled_time 0, and an id being new is not on its
      // own a reason to follow anything.
      const nodes = (data.node_groups ?? []).flatMap(function walk(g): Array<{ scheduled_time?: number }> {
        return [...(g.nodes ?? []), ...(g.node_groups ?? []).flatMap(walk)]
      })
      const upcoming = nodes.some(
        (n) => (n.scheduled_time ?? 0) > nowSeconds && (n.scheduled_time ?? 0) < horizon,
      )
      if (!upcoming) continue

      const info = data.info ?? {}
      await db
        .insert(leagues)
        .values({
          leagueId,
          name: info.name ?? null,
          tier: info.tier ?? null,
          region: info.region ?? null,
          startTimestamp: info.start_timestamp ?? null,
          endTimestamp: info.end_timestamp ?? null,
          totalPrizePool: data.prize_pool?.total_prize_pool ?? null,
          description: info.description ?? null,
          streams: data.streams ?? null,
          raw: info,
          lastSyncedAt: new Date(),
        })
        // Seeding only: a row that appeared in the meantime is the sync's business, not ours.
        .onConflictDoNothing({ target: leagues.leagueId })

      result.seeded.push(leagueId)
      logger.info({ leagueId, name: info.name ?? null }, 'seed: found an announced tournament')
    } catch (err) {
      logger.warn({ leagueId, err: briefError(err) }, 'seed: probe failed')
    }
  }

  if (result.probed > 0) logger.info(result, 'seed: announced-league sweep')
  return result
}
