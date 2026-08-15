import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { env } from './env.js'
import liveRoutes from './routes/live.js'
import heroRoutes from './routes/heroes.js'
import archiveRoutes from './routes/archive.js'
import { startIngest, stopIngest } from './services/ingest/ingestJob.js'
import { closeDb } from './db/index.js'
import { logger } from './logger.js'

const app = new Hono()

// SECURITY (T-11-08): exact env-driven origin, scoped to /api/*, credentials stays false (no '*').
// CORS_ORIGIN is the exact Vercel production URL (no trailing slash); dev falls back to localhost.
app.use('/api/*', cors({ origin: env.CORS_ORIGIN ?? 'http://localhost:5173' }))

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', ts: Date.now() })
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
  console.log(`BFF listening on http://localhost:${port}`)
})

// Phase 10.1 D-03: graceful shutdown. Railway sends SIGTERM and waits ~10s
// before SIGKILL. Drain the in-flight sampler tick and close HTTP sockets.
async function shutdown(signal: 'SIGTERM' | 'SIGINT'): Promise<void> {
  logger.info({ signal }, 'shutdown initiated')
  await stopIngest()
  await closeDb()
  httpServer.close(() => process.exit(0))
  // Hard-timeout safety net — never block longer than Railway grants.
  setTimeout(() => process.exit(1), 9000).unref()
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})
process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

export default app
