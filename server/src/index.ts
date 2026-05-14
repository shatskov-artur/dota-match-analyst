import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { env } from './env.js'
import liveRoutes from './routes/live.js'
import heroRoutes from './routes/heroes.js'
import { startSampler, stopSampler } from './services/historySamplerJob.js'
import { logger } from './logger.js'

const app = new Hono()

app.use('*', cors({ origin: 'http://localhost:5173' }))

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', ts: Date.now() })
})

app.route('/api/live', liveRoutes)
app.route('/api', heroRoutes)

const port = Number(env.PORT)

// Phase 10.1 D-01: start the background history sampler before the listener
// binds so it is alive as soon as Node accepts requests. Idempotent and
// env-gated by HISTORY_SAMPLER_DISABLED inside the module.
startSampler()

const httpServer = serve({ fetch: app.fetch, port }, () => {
  console.log(`BFF listening on http://localhost:${port}`)
})

// Phase 10.1 D-03: graceful shutdown. Railway sends SIGTERM and waits ~10s
// before SIGKILL. Drain the in-flight sampler tick and close HTTP sockets.
async function shutdown(signal: 'SIGTERM' | 'SIGINT'): Promise<void> {
  logger.info({ signal }, 'shutdown initiated')
  await stopSampler()
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
