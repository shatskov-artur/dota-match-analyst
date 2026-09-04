import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { env } from './env.js'
import liveRoutes from './routes/live.js'
import heroRoutes from './routes/heroes.js'
import archiveRoutes from './routes/archive.js'
import { startIngest, stopIngest } from './services/ingest/ingestJob.js'
import { closeDb, pingDb, db } from './db/index.js'
import { closeRedis } from './cache.js'
import { rateLimit } from './middleware/rateLimit.js'
import { requireApiToken } from './middleware/apiToken.js'
import { logger, briefError } from './logger.js'

const app = new Hono()

// Responses are JSON, but /api/matches/:id/at replays a jsonb payload built from strings
// Valve supplied (team and player names), and these headers cost nothing. CSP is omitted
// deliberately: this origin serves no HTML, and the SPA's policy belongs in vercel.json
// where the document is actually served.
app.use('*', secureHeaders())

// SECURITY (T-11-08): exact env-driven origin, scoped to /api/*, credentials stays false (no '*').
// CORS_ORIGIN is the exact Vercel production URL (no trailing slash); dev falls back to
// localhost — and env.ts rejects that fallback under NODE_ENV=production, because there it
// would let a page on the visitor's own machine read the API. GET-only: every route here is
// a read, so allowing anything else only widens what a preflight will agree to.
app.use(
  '/api/*',
  cors({
    origin: env.CORS_ORIGIN ?? 'http://localhost:5173',
    allowMethods: ['GET', 'OPTIONS'],
    allowHeaders: ['Authorization', 'X-Api-Token', 'Content-Type'],
    maxAge: 600,
  }),
)

// Two tiers, because two very different things are being rationed.
//
// The broad limit protects the archive: every /api/tournaments|schedule|matches call is an
// uncached Postgres read against a pool of ten connections.
//
// The narrow one protects money. A single /api/live/intel/:id fans out to as many as ten
// OpenDota calls and ten Stratz calls, and the Stratz budget is 500 an hour — so this
// endpoint, alone, is what turns an open BFF into a blind one.
app.use('/api/*', rateLimit({ windowMs: 60_000, limit: 120, name: 'api' }))
app.use('/api/live/intel/*', rateLimit({ windowMs: 60_000, limit: 10, name: 'intel' }))
app.use('/api/live/winprob/*', rateLimit({ windowMs: 60_000, limit: 20, name: 'winprob' }))

// Rate limiting first, then identity: an unauthenticated flood should be cheap to refuse.
app.use('/api/*', requireApiToken())

/**
 * Liveness plus a straight answer about the archive.
 *
 * `status: ok` means the process serves requests, which is what the platform's healthcheck
 * should restart on. The archive is reported separately and never fails the check, because
 * /api/live/* is fully functional without it — but it has to be reported at all: a deploy
 * that lost DATABASE_URL, or one whose migrations never ran, used to look perfectly green
 * while every tournament page quietly served nothing.
 */
app.get('/api/health', async (c) => {
  const archive = db ? (await pingDb(true)) ? 'reachable' : 'unreachable' : 'not_configured'
  return c.json({ status: 'ok', archive, ts: Date.now() })
})

app.route('/api/live', liveRoutes)
app.route('/api', heroRoutes)
// v2.0 archive: tournaments, brackets, series, per-minute timelines and time travel.
app.route('/api', archiveRoutes)

const port = Number(env.PORT)

// Phase 10.1 D-01 (v2.0: now the ingest job): start the background tick before the
// listener binds so it is alive as soon as Node accepts requests. Idempotent and
// env-gated by INGEST_DISABLED / HISTORY_SAMPLER_DISABLED inside the module.
// It subsumes the old history sampler — enrichLiveGames still writes the Redis
// timeseries — and additionally archives every tracked match to Postgres.
startIngest()

const httpServer = serve({ fetch: app.fetch, port }, () => {
  logger.info({ port }, 'BFF listening')
})

/** Railway sends SIGTERM and waits ~10s before SIGKILL, so everything below fits in that. */
const SHUTDOWN_DEADLINE_MS = 9_000

let shuttingDown = false

/** Exported for tests — clears the once-only guard between shutdown assertions. */
export function __resetShutdownState(): void {
  shuttingDown = false
}

/**
 * Phase 10.1 D-03: graceful shutdown.
 *
 * Order matters and the previous one was backwards: the Postgres pool was closed before
 * the listener stopped accepting, so requests that arrived during the drain window hit a
 * dead pool and were answered 503 by the archive error boundary — on every single deploy.
 * Stop accepting first, then tear down what the in-flight requests were using.
 *
 * The deadline timer is NOT unref'd. Unref'd, it could not hold the loop open, so the one
 * job it existed for — bounding a hang — was the one job it could not do.
 */
async function shutdown(signal: 'SIGTERM' | 'SIGINT'): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'shutdown initiated')

  const deadline = setTimeout(() => {
    logger.error({ signal }, 'shutdown timed out — exiting hard')
    process.exit(1)
  }, SHUTDOWN_DEADLINE_MS)

  try {
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve())
      // close() waits for open connections, and a keep-alive socket from a polling client
      // is open indefinitely — that alone would spend the platform's whole grace period.
      // Guarded because the method only exists on Node's http.Server (18.2+).
      const server = httpServer as unknown as { closeIdleConnections?: () => void }
      server.closeIdleConnections?.()
    })
    await stopIngest()
    await closeDb()
    await closeRedis()
  } catch (err) {
    logger.error({ signal, err: briefError(err) }, 'shutdown encountered an error')
  }

  clearTimeout(deadline)
  process.exit(0)
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})
process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

export default app
