import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { env } from './env.js'
import liveRoutes from './routes/live.js'
import heroRoutes from './routes/heroes.js'

const app = new Hono()

app.use('*', cors({ origin: 'http://localhost:5173' }))

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', ts: Date.now() })
})

app.route('/api/live', liveRoutes)
app.route('/api', heroRoutes)

const port = Number(env.PORT)

serve({ fetch: app.fetch, port }, () => {
  console.log(`BFF listening on http://localhost:${port}`)
})

export default app
