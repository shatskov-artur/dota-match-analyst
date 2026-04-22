import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', cors({ origin: 'http://localhost:5173' }))

app.get('/health', (c) => {
  return c.json({ status: 'ok', ts: Date.now() })
})

const port = Number(process.env.PORT ?? 3001)

serve({ fetch: app.fetch, port }, () => {
  console.log(`BFF listening on http://localhost:${port}`)
})

export default app
