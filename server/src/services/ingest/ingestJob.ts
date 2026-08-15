import { getLiveLeagueGames } from '../valveApi.js'
import { enrichLiveGames, deriveGameState, type ValveGames } from '../liveAggregator.js'
import { writeSnapshot, prunePrevStates } from './snapshotWriter.js'
import { syncLeagues, discoverTrackedMatches, linkOrphanLiveMatches } from './tournamentSync.js'
import { closeStaleLiveMatches, runBackfillTick } from './postMatchBackfill.js'
import { db, pingDb } from '../../db/index.js'
import { env, archivedLeagueTiers, trackedLeagueIds } from '../../env.js'
import { shouldArchiveLeague, filterArchivableLeagues, reportSkippedLeagues } from './archivePolicy.js'
import { getLeaguesOfInterest } from './leaguesOfInterest.js'
import { seedAnnouncedLeagues } from './seedAnnouncedLeagues.js'
import { logger, briefError } from '../../logger.js'

// The single background tick for v2.0. Replaces historySamplerJob: enrichLiveGames()
// performs the same Redis timeseries write that job used to do, so the live UI keeps
// accumulating gold/XP history with zero viewers — and on top of that every tracked
// match is persisted to the archive.
//
// Cadences, all driven off one 30s timer so they can never overlap each other:
//   every tick  (30s) — snapshot every tracked live match, then the stale-live sweep
//   every 10th  ( 5m) — tournamentSync: bracket, schedule, standings, team names
//                        then match discovery from OpenDota for the tracked leagues
//   every 20th  (10m) — postMatchBackfill: OpenDota parsed replays (sweeps first itself)
//
// Overlap guard, per-match try/catch, allSettled fan-out and the env opt-out all mirror
// the Phase 10.1 sampler contract (D-04, D-05, D-06, D-07, D-11).

export const INTERVAL_MS = 30_000
export const TOURNAMENT_SYNC_EVERY = 10
export const BACKFILL_EVERY = 20
/**
 * Once a day (2880 ticks × 30s). Looks for tournaments that have been ANNOUNCED but have
 * never played a game, which is the one window getLeaguesOfInterest cannot see into —
 * a league earns its archive row from its first live match. Costs one catalogue fetch plus
 * at most PROBE_BUDGET keyless calls, so a daily cadence is generous.
 */
export const SEED_ANNOUNCED_EVERY = 2_880
export const INGEST_SOURCE = 'ingestJob'

let handle: NodeJS.Timeout | null = null
let isRunning = false
let inFlight: Promise<void> | null = null
let inFlightStartedAt = 0
let tickCount = 0

/** Exported for tests — resets the module-level tick counter. */
export function __resetTickCount(): void {
  tickCount = 0
}

export function isIngestDisabled(): boolean {
  // HISTORY_SAMPLER_DISABLED is honoured too: it was the documented kill switch before
  // v2.0 and anyone with it set in .env means "do not poll Valve in the background".
  return env.INGEST_DISABLED === '1' || process.env.HISTORY_SAMPLER_DISABLED === '1'
}

export interface TickResult {
  games: number
  archived: number
  skipped: number
}

export async function runOnce(): Promise<TickResult> {
  const result: TickResult = { games: 0, archived: 0, skipped: 0 }
  if (isRunning) {
    logger.warn({ inFlightAgeMs: Date.now() - inFlightStartedAt }, 'ingest tick overlap, skipping')
    return result
  }
  isRunning = true
  inFlightStartedAt = Date.now()
  const tick = tickCount++

  try {
    const data = await getLiveLeagueGames()
    const games = (data?.result?.games ?? []) as ValveGames
    result.games = games.length

    // Enrich EVERY game, not just tracked ones: this is what keeps the Redis gold/XP
    // timeseries alive for the whole live list, exactly as historySamplerJob did.
    // Only the archive write is filtered.
    const enriched = await enrichLiveGames(games)

    if (db) {
      // 2 = draft (worth archiving: picks/bans), 5 = in-game.
      // 6 = post-game carries no scoreboard worth a new snapshot; the stale-live
      // sweep in postMatchBackfill closes those out instead.
      const inArchivableState = enriched.filter((g) => {
        if (typeof g.match_id !== 'number') return false
        const state = g.game_state ?? 2
        return state === 2 || state === 5
      })
      const decisions = await Promise.all(inArchivableState.map((g) => shouldArchiveLeague(g.league_id)))
      const archivable = inArchivableState.filter((_, i) => decisions[i])
      result.skipped = enriched.length - archivable.length
      // One line saying WHAT was turned away, rather than a silent recorder.
      reportSkippedLeagues()

      const writes = await Promise.allSettled(
        archivable.map(async (g) => {
          try {
            return await writeSnapshot(g)
          } catch (err) {
            logger.error({ matchId: g.match_id, err: briefError(err) }, 'ingest: snapshot write failed')
            return null
          }
        }),
      )
      result.archived = writes.filter((w) => w.status === 'fulfilled' && w.value).length

      // Free the per-match diff state for matches that left the live feed.
      // This used to walk `archivable` and ask whether each entry was in `enriched` — but
      // archivable is a subset of enriched, so the answer was always yes and nothing was
      // ever freed. Only snapshotWriter knows which matches it is still holding state for,
      // so it does the pruning against the set that is actually live.
      const liveIds = new Set(
        enriched.map((g) => g.match_id).filter((id): id is number => typeof id === 'number'),
      )
      const dropped = prunePrevStates(liveIds)
      if (dropped > 0) logger.debug({ dropped }, 'ingest: freed diff state for matches that left the feed')

      // A map Valve has not yet attached to its series is unreachable from every page
      // that navigates by series, so this runs at snapshot speed rather than waiting for
      // the 5-minute bracket sync — a draft is over in less than that.
      const linked = await linkOrphanLiveMatches()
      if (linked > 0) logger.info({ linked }, 'ingest: linked live matches to their series')
    }

    if (tick % TOURNAMENT_SYNC_EVERY === 0) {
      /*
       * THREE sources, and the middle one is the fix for a symptom that had no other cure.
       *
       *   tracked      the operator named these by id
       *   ofInterest   tournaments the ARCHIVE says are still running — read from the
       *                leagues table, not from the feed
       *   liveLeagues  whatever has a game on this minute, so "what's on this week" covers
       *                the whole scene and not just what is being recorded
       *
       * Without the middle set a tournament was asked about only while one of its own
       * matches was in progress. Valve publishes the next day's fixtures in the evening,
       * when the feed is empty — so the schedule froze showing one fixture where five had
       * been announced, and only a human editing the code could unfreeze it.
       */
      const liveLeagues = enriched
        .map((g) => g.league_id)
        .filter((id): id is number => typeof id === 'number' && id > 0)

      // Before asking who is active, give a just-announced tournament the chance to BE
      // known: it has no archive row until its first game is played, and its bracket is
      // published days earlier. Daily, and bounded — see seedAnnouncedLeagues.
      if (tick % SEED_ANNOUNCED_EVERY === 0) {
        await seedAnnouncedLeagues()
      }

      const ofInterest = await getLeaguesOfInterest()
      const ofInterestSet = new Set(ofInterest)

      const synced = await syncLeagues(
        [...trackedLeagueIds, ...ofInterest, ...liveLeagues],
        ofInterestSet,
      )
      if (synced.length > 0) {
        logger.info(
          { leagues: synced.length, ofInterest: ofInterest.length, live: liveLeagues.length },
          'ingest: tournament sync',
        )
      }

      // Second, unrelated source for "which games were played". Runs after the bracket
      // sync and independently of whether it found anything, because the case this
      // exists for is precisely the one where Valve tells us nothing.
      //
      // Same three sources: an active tournament keeps its overnight recovery on a day it
      // is not playing, which is when the recovery is actually needed.
      const found = await discoverTrackedMatches([
        ...(await filterArchivableLeagues(liveLeagues)),
        ...ofInterest,
      ])
      const stubs = found.reduce((n, r) => n + r.matchStubs, 0)
      if (stubs > 0) logger.info({ leagues: found.length, matches: stubs }, 'ingest: match discovery')
    }
    if (tick % BACKFILL_EVERY === 0) {
      // runBackfillTick sweeps stale live matches itself before picking its batch.
      await runBackfillTick()
    } else {
      // The sweep is what flips a finished match out of `live`, and it used to ride along
      // with the backfill only — so STALE_LIVE_MINUTES said "closed after 4 minutes" while
      // the code could not act on it for up to 10 more. A match stayed flagged live for a
      // quarter of an hour after it ended, and every reader of that flag said so: the
      // series tab kept its live dot, and /series/:id kept resolving to the finished map
      // instead of the one being played. It is one UPDATE, so it belongs on every tick.
      const closed = await closeStaleLiveMatches()

      // A match that just ended is the one case worth not waiting ten minutes for. Its
      // result is already published — every other site shows it within a minute — so the
      // fetch happens now rather than at the next backfill slot. Bounded by the same
      // BATCH, and only on the tick where something actually finished.
      if (closed > 0) await runBackfillTick()
    }

    if (result.archived > 0) {
      logger.info(result, 'ingest tick')
    }
  } catch (err) {
    logger.error({ err: briefError(err) }, 'ingest tick failed')
  } finally {
    isRunning = false
  }
  return result
}

/** Attempts before giving up and letting the regular 30s tick retry. */
const ARCHIVE_WAIT_TRIES = 10
const ARCHIVE_WAIT_MS = 1_000

async function waitForArchive(): Promise<void> {
  if (!db) return
  for (let i = 0; i < ARCHIVE_WAIT_TRIES; i++) {
    if (await pingDb(true)) {
      if (i > 0) logger.info({ waitedMs: i * ARCHIVE_WAIT_MS }, 'ingest: archive ready')
      return
    }
    await new Promise((r) => setTimeout(r, ARCHIVE_WAIT_MS))
  }
  logger.error('ingest: archive did not become reachable — the next tick will retry')
}

export function startIngest(): void {
  if (isIngestDisabled()) {
    logger.info({ source: INGEST_SOURCE }, 'ingest disabled via env')
    return
  }
  if (handle) return // idempotent
  if (!db) {
    logger.error(
      { source: INGEST_SOURCE },
      'ingest: DATABASE_URL not configured — live enrichment will still run but NOTHING will be archived',
    )
  } else if (trackedLeagueIds.size === 0) {
    logger.info(
      { source: INGEST_SOURCE, tiers: [...archivedLeagueTiers] },
      'ingest: no explicit league list — archiving by tournament tier. ' +
        'Set TRACKED_LEAGUE_IDS (npm run find:league) to record specific leagues instead.',
    )
  } else {
    logger.info({ source: INGEST_SOURCE, leagues: [...trackedLeagueIds] }, 'ingest: archiving tracked leagues')
  }

  handle = setInterval(() => {
    inFlight = runOnce().then(() => undefined)
  }, INTERVAL_MS)
  // Run immediately rather than waiting a full interval — on a tournament morning the
  // first 30 seconds matter — but only once the archive can actually answer. `npm run
  // dev:all` starts Postgres and the BFF together, and after an unclean shutdown Postgres
  // spends a few seconds in crash recovery answering "the database system is starting up".
  inFlight = waitForArchive().then(() => runOnce().then(() => undefined))
  logger.info({ intervalMs: INTERVAL_MS, source: INGEST_SOURCE }, 'ingest started')
}

export async function stopIngest(): Promise<void> {
  if (handle) {
    clearInterval(handle)
    handle = null
  }
  if (inFlight) {
    try {
      await inFlight
    } catch {
      // runOnce already swallows + logs; defensive catch in case the body changes.
    }
    inFlight = null
  }
  logger.info({ source: INGEST_SOURCE }, 'ingest stopped')
}

export { deriveGameState }
