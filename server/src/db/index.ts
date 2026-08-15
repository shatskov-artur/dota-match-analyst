import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../env.js'
import { logger, briefError } from '../logger.js'
import * as schema from './schema.js'

// Mirrors the `redis: Redis | null` contract in cache.ts: a missing or unreachable
// archive must never stop the BFF from serving /api/live/*. The difference is that a
// missing archive silently loses tournament data, so it is logged at error level and
// the ingest job refuses to start (see services/ingest/ingestJob.ts).

export type Db = ReturnType<typeof drizzle<typeof schema>>

let sql: ReturnType<typeof postgres> | null = null
export let db: Db | null = null

if (env.DATABASE_URL) {
  try {
    sql = postgres(env.DATABASE_URL, {
      // The sampler writes ~10 rows per match per tick; a handful of connections is plenty
      // and keeps a local Postgres from being swamped.
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      // postgres-js logs the connection string on notice by default — silence it,
      // DATABASE_URL carries a password.
      onnotice: () => {},
    })
    db = drizzle(sql, { schema })
    logger.info('archive: postgres client initialised')
  } catch (err) {
    logger.error(
      { err: briefError(err) },
      'archive: failed to initialise postgres — tournament data will NOT be recorded',
    )
    sql = null
    db = null
  }
} else {
  logger.warn(
    'archive: DATABASE_URL is not set — tournament data will NOT be recorded. ' +
      'Run `docker compose -f docker-compose.local.yml up -d` and set DATABASE_URL in server/.env.',
  )
}

/**
 * Round-trips a trivial query so callers can distinguish "configured" from "reachable".
 *
 * `quiet` is for the startup poll: `npm run dev:all` brings Postgres and the BFF up
 * together, so the first ping legitimately fails with "the database system is not yet
 * accepting connections". Logging that at error level trains the reader to ignore errors.
 */
export async function pingDb(quiet = false): Promise<boolean> {
  if (!sql) return false
  try {
    await sql`select 1`
    return true
  } catch (err) {
    if (quiet) logger.debug({ err: briefError(err) }, 'archive: postgres not ready yet')
    else logger.error({ err: briefError(err) }, 'archive: postgres ping failed')
    return false
  }
}

/** Drains the pool on shutdown so an in-flight ingest tick finishes its writes. */
export async function closeDb(): Promise<void> {
  if (!sql) return
  try {
    await sql.end({ timeout: 5 })
  } catch (err) {
    logger.error({ err: briefError(err) }, 'archive: postgres close failed')
  }
}

export { schema }
