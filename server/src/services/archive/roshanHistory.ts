import { and, eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { matchEvents } from '../../db/schema.js'
import { logger, briefError } from '../../logger.js'
import type { RoshanKill, RoshanState } from '../roshanState.js'

/**
 * Rebuild the Roshan kill history from the archive when Redis has nothing.
 *
 * Redis holds the live counter for six hours, and a restart wipes it — so the sampler used
 * to bootstrap a mid-match restart at "kill #1" no matter how many Roshans had actually
 * died. That is not a cosmetic slip: the loot shown beside the counter is CHOSEN BY KILL
 * NUMBER — the first Roshan drops only the aegis, the third adds cheese and a refresher
 * shard — so a restart during a late game advertised the wrong drop for the rest of it.
 *
 * The correct number was on disk the whole time: every detected kill is written to
 * match_events as a `roshan` row carrying its number and the game second it happened at.
 *
 * WHY THIS LIVES IN services/archive/ RATHER THAN BESIDE roshanState:
 * roshanState is on the live path and knows only Redis. Teaching it to read Postgres would
 * have dragged the archive into every live request — the same coupling this audit spent its
 * day removing. The live aggregator asks for Redis first and falls back to here.
 */
export async function recoverRoshanState(matchId: number): Promise<RoshanState | null> {
  if (!db) return null
  try {
    const rows = await db
      .select({ t: matchEvents.t, payload: matchEvents.payload })
      .from(matchEvents)
      .where(and(eq(matchEvents.matchId, matchId), eq(matchEvents.type, 'roshan')))
      .orderBy(sql`${matchEvents.t} asc`)
    if (rows.length === 0) return null

    /*
     * Deduplicated by kill NUMBER, not by row.
     *
     * The same kill legitimately appears twice: once from the live counter diff
     * (`roshan:2`) and once from OpenDota's parsed objective log (`od:roshan:…`). Counting
     * rows would report four Roshans in a two-Roshan game as soon as a match was backfilled.
     */
    const byNumber = new Map<number, RoshanKill>()
    let unnumbered = 0
    for (const r of rows) {
      const payload = (r.payload ?? {}) as { killNumber?: unknown }
      // OpenDota's objective rows carry no number of their own; they arrive in time order,
      // so counting them is the only numbering available and it is the right one.
      const n = typeof payload.killNumber === 'number' ? payload.killNumber : ++unnumbered
      // The earliest sighting of a kill is the truthful one; a later row is the same event
      // re-reported at different precision.
      if (!byNumber.has(n)) byNumber.set(n, { n, gameTime: r.t, timestamp: 0 })
    }

    const kills = [...byNumber.values()].sort((a, b) => a.n - b.n)
    logger.info({ matchId, killCount: kills.length }, 'roshan: recovered kill history from the archive')
    /*
     * prevTimer starts at 0 — the honest unknown.
     *
     * Whether Roshan is down RIGHT NOW comes from the next Valve tick, not from the event
     * log. Starting at 0 means the next non-zero timer registers as a new kill, which is
     * correct: if he is already down, the tick after this one reports it and the count
     * moves on from the recovered number rather than from one.
     */
    return { killCount: kills.length, prevTimer: 0, kills }
  } catch (err) {
    // A live response must never break because the archive is unreachable.
    logger.warn({ matchId, err: briefError(err) }, 'roshan: archive recovery failed')
    return null
  }
}
