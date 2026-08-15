import { getLeagueInfo } from '../openDotaApi.js'
import { hasExplicitLeagueList, isTrackedLeague, shouldArchiveTier } from '../../env.js'
import { logger, briefError } from '../../logger.js'

/**
 * One answer to "is this league worth recording", for every part of the ingest that asks.
 *
 * It lives in its own module because three different stages need it — the 30s snapshot
 * tick, the bracket sync that creates match rows, and the overnight discovery pass — and
 * routing them all through ingestJob would make tournamentSync import the job that imports
 * it. The rule itself is small; having one copy of it is the point (see K3 in AUDIT-REPORT).
 *
 * TWO RULES, IN ORDER:
 *
 *  1. An explicit TRACKED_LEAGUE_IDS list is an instruction, and it is EXCLUSIVE: those
 *     leagues and no others, whatever tier OpenDota thinks they are. This is the escape
 *     hatch for a tournament that has just been announced and is not indexed yet.
 *
 *  2. Otherwise the tournament's CALIBRE decides — ARCHIVE_LEAGUE_TIERS, defaulting to
 *     premium + professional. The old default was "record every live league match", which
 *     is how a quiet Tuesday of FACEIT ladders and community cups wrote roughly a gigabyte
 *     of snapshots a day for games nobody would ever open.
 */

/** Per-process memo, so one tick asking about the same league ten times costs one lookup. */
const decisions = new Map<number, boolean>()

/** Exported for tests, and for the case where the operator changes the env and restarts. */
export function resetArchivePolicyCache(): void {
  decisions.clear()
}

export async function shouldArchiveLeague(leagueId: number | undefined): Promise<boolean> {
  if (isTrackedLeague(leagueId)) return true
  if (hasExplicitLeagueList()) return false
  if (typeof leagueId !== 'number' || leagueId <= 0) return false

  const memo = decisions.get(leagueId)
  if (memo !== undefined) return memo

  try {
    const info = await getLeagueInfo(leagueId)
    const ok = shouldArchiveTier(info?.tier)
    decisions.set(leagueId, ok)
    if (!ok) {
      logger.debug(
        { leagueId, tier: info?.tier ?? null, name: info?.name ?? null },
        'archive policy: league below the recorded tier, skipping',
      )
    }
    return ok
  } catch (err) {
    /*
     * A failed lookup means "not now", never "record it anyway", and the answer is NOT
     * memoised so the next tick asks again.
     *
     * The asymmetry is deliberate. An OpenDota outage lasts minutes, so being wrong in this
     * direction costs a few ticks of one match; being wrong in the other direction reopens
     * unbounded disk growth for the whole length of the outage. A league that is being
     * recorded on purpose is listed explicitly and never reaches this code at all.
     */
    logger.warn(
      { leagueId, err: briefError(err) },
      'archive policy: tier unresolved — skipping this tick rather than recording blind',
    )
    return false
  }
}

/** Filters a set of league ids down to the ones worth recording. Order is not preserved. */
export async function filterArchivableLeagues(leagueIds: Iterable<number>): Promise<number[]> {
  const ids = [...new Set(leagueIds)]
  const verdicts = await Promise.all(ids.map((id) => shouldArchiveLeague(id)))
  return ids.filter((_, i) => verdicts[i])
}
