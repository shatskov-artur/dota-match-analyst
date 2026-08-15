import { desc, gt, isNull, or, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { leagues } from '../../db/schema.js'
import { shouldArchiveLeague } from './archivePolicy.js'
import { logger, briefError } from '../../logger.js'

/**
 * Which tournaments are worth asking Valve about, whether or not a game is on right now.
 *
 * THE BUG THIS EXISTS FOR
 * The 5-minute schedule sync used to walk exactly two sets: the explicit TRACKED_LEAGUE_IDS
 * list, and whatever had a match in GetLiveLeagueGames at that instant. Since recording
 * moved to tier-based policy the explicit list is empty by default, so between playing days
 * a tournament was asked about by NOBODY.
 *
 * That is not a corner case, it is the normal rhythm of a tournament. Valve publishes the
 * next day's fixtures late in the evening, once seeding is decided — which is precisely when
 * the feed is empty. So the schedule froze on whatever had been published while the last
 * match of the day was still live: The International showed ONE fixture for the next day
 * while Liquipedia already listed five, and the only way to fix it was to ask a human to go
 * and change the code. The app existed to answer that question and could not.
 *
 * THE SOURCE OF TRUTH IS THE ARCHIVE, NOT THE FEED
 * A tournament earns a row in `leagues` the first time it is seen, and that row carries its
 * end date. "Still running" is a property of the row, not of whether a game happens to be on
 * this minute — so that is what drives the sync from now on. Nothing has to be added to a
 * config file: a tournament that has been on once keeps being followed until it is over.
 */

/**
 * How long after its own end date a tournament keeps being synced.
 *
 * A grand final routinely runs past midnight and Valve's `end_timestamp` is approximate, so
 * dropping a league the instant its date passes would stop syncing the bracket while the
 * last series was still being played — and leave the final result unrecorded.
 */
export const LEAGUE_GRACE_DAYS = 3

/**
 * Upper bound on the set.
 *
 * Each league here costs one keyless GetLeagueData (cached 5 min) and one OpenDota league
 * history call per discovery pass. A dozen concurrent tournaments is already a very busy
 * weekend; the cap exists so a `leagues` table that has accumulated years of rows cannot
 * turn one tick into hundreds of requests.
 */
export const MAX_LEAGUES_OF_INTEREST = 12

/**
 * Active tournaments from the archive, filtered by the same policy that decides recording.
 *
 * Ordered by end date, latest first, so the cap keeps what is most current. A league with no
 * end date at all is kept rather than dropped — Valve leaves it unset often enough that
 * treating "unknown" as "over" would silently lose tournaments — and the tier policy is what
 * stops that from meaning "every amateur ladder ever seen".
 */
export async function getLeaguesOfInterest(
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<number[]> {
  if (!db) return []
  const cutoff = nowSeconds - LEAGUE_GRACE_DAYS * 86_400

  let rows: Array<{ leagueId: number }>
  try {
    rows = await db
      .select({ leagueId: leagues.leagueId })
      .from(leagues)
      .where(or(isNull(leagues.endTimestamp), gt(leagues.endTimestamp, cutoff)))
      // NULLS LAST: a dated, currently-running tournament outranks one whose dates Valve
      // never filled in.
      .orderBy(sql`${leagues.endTimestamp} desc nulls last`, desc(leagues.leagueId))
  } catch (err) {
    // The schedule sync must survive an unreachable archive exactly as it did before this
    // existed: fall back to "nothing extra", never throw into the ingest tick.
    logger.warn({ err: briefError(err) }, 'leagues of interest: query failed')
    return []
  }

  const candidates = rows.map((r) => r.leagueId)
  if (candidates.length === 0) return []

  // shouldArchiveLeague is the ONE place the tier rule lives (K3 in AUDIT-REPORT) and it
  // memoises per process, so asking it about the same dozen leagues every five minutes is
  // free after the first pass.
  //
  // allSettled, not all: one league whose verdict cannot be reached must cost that league,
  // not the whole list. Promise.all would reject and take the schedule sync down with it —
  // and the sync going quiet is the exact failure this module was written to end.
  const verdicts = await Promise.allSettled(candidates.map((id) => shouldArchiveLeague(id)))
  const kept = candidates.filter((_, i) => {
    const v = verdicts[i]
    if (v.status === 'rejected') {
      logger.warn({ leagueId: candidates[i], err: briefError(v.reason) }, 'leagues of interest: verdict failed')
      return false
    }
    return v.value
  })

  if (kept.length > MAX_LEAGUES_OF_INTEREST) {
    logger.info(
      { kept: MAX_LEAGUES_OF_INTEREST, dropped: kept.length - MAX_LEAGUES_OF_INTEREST },
      'leagues of interest: cap reached',
    )
  }
  return kept.slice(0, MAX_LEAGUES_OF_INTEREST)
}
