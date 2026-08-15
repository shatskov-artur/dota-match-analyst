import { asc, eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { matchTimeline, playerTimeline, matchEvents, matchAnalysis } from '../../db/schema.js'
import { buildAnalysis, ANALYSIS_VERSION, type MatchAnalysis } from './matchAnalysis.js'
import { logger } from '../../logger.js'

/** Loads the archive rows for a match, runs the analysers, and stores the result. */
export async function computeAndStoreAnalysis(matchId: number): Promise<MatchAnalysis | null> {
  if (!db) return null

  const [timeline, players, events] = await Promise.all([
    db
      .select({
        minute: matchTimeline.minute,
        radiantGoldAdv: matchTimeline.radiantGoldAdv,
        radiantXpAdv: matchTimeline.radiantXpAdv,
        radiantScore: matchTimeline.radiantScore,
        direScore: matchTimeline.direScore,
        source: matchTimeline.source,
      })
      .from(matchTimeline)
      .where(eq(matchTimeline.matchId, matchId))
      .orderBy(asc(matchTimeline.minute)),
    db
      .select({
        minute: playerTimeline.minute,
        playerSlot: playerTimeline.playerSlot,
        heroId: playerTimeline.heroId,
        team: playerTimeline.team,
        playerName: playerTimeline.playerName,
        netWorth: playerTimeline.netWorth,
        xp: playerTimeline.xp,
        lastHits: playerTimeline.lastHits,
      })
      .from(playerTimeline)
      .where(eq(playerTimeline.matchId, matchId)),
    db
      .select({ t: matchEvents.t, type: matchEvents.type, team: matchEvents.team, payload: matchEvents.payload })
      .from(matchEvents)
      .where(eq(matchEvents.matchId, matchId))
      .orderBy(asc(matchEvents.t)),
  ])

  if (timeline.length === 0) {
    logger.warn({ matchId }, 'analysis: no timeline rows, nothing to compute')
    return null
  }

  const analysis = buildAnalysis(
    timeline,
    players,
    events.map((e) => ({ t: e.t, type: e.type, team: e.team, payload: e.payload as Record<string, unknown> | null })),
  )

  await db
    .insert(matchAnalysis)
    .values({ matchId, version: ANALYSIS_VERSION, data: analysis, computedAt: new Date() })
    .onConflictDoUpdate({
      target: matchAnalysis.matchId,
      set: { version: sql`excluded.version`, data: sql`excluded.data`, computedAt: sql`excluded.computed_at` },
    })

  logger.info(
    { matchId, swings: analysis.swings.length, objectives: analysis.topObjectives.length },
    'analysis: stored',
  )
  return analysis
}

export * from './matchAnalysis.js'
