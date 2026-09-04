import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  briefError: (err: unknown) => String(err),
}))

const TOKEN = 'a-token-of-adequate-length'

const envMock: { API_TOKEN?: string } = {}
vi.mock('../env.js', () => ({
  get env() {
    return envMock
  },
}))

async function guardedApp() {
  vi.resetModules()
  const { requireApiToken } = await import('./apiToken.js')
  const app = new Hono()
  app.get('/api/health', (c) => c.json({ status: 'ok' }))
  app.use('/api/*', requireApiToken())
  app.get('/api/live/games', (c) => c.json({ games: [] }))
  return app
}

describe('requireApiToken', () => {
  beforeEach(() => {
    delete envMock.API_TOKEN
  })

  it('is a pass-through when API_TOKEN is unset', async () => {
    // The local-machine configuration: no token, no ceremony. env.ts is what makes this
    // impossible under NODE_ENV=production.
    const app = await guardedApp()
    expect((await app.request('/api/live/games')).status).toBe(200)
  })

  it('refuses a request carrying no token', async () => {
    envMock.API_TOKEN = TOKEN
    const app = await guardedApp()

    const res = await app.request('/api/live/games')
    expect(res.status).toBe(401)
  })

  it('refuses a wrong token', async () => {
    envMock.API_TOKEN = TOKEN
    const app = await guardedApp()

    const res = await app.request('/api/live/games', {
      headers: { authorization: 'Bearer not-the-right-token-at-all' },
    })
    expect(res.status).toBe(401)
  })

  it('accepts the token as a bearer credential', async () => {
    envMock.API_TOKEN = TOKEN
    const app = await guardedApp()

    const res = await app.request('/api/live/games', {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.status).toBe(200)
  })

  it('accepts a bearer scheme written in any case', async () => {
    envMock.API_TOKEN = TOKEN
    const app = await guardedApp()

    const res = await app.request('/api/live/games', {
      headers: { authorization: `bearer ${TOKEN}` },
    })
    expect(res.status).toBe(200)
  })

  it('accepts the X-Api-Token header', async () => {
    envMock.API_TOKEN = TOKEN
    const app = await guardedApp()

    const res = await app.request('/api/live/games', { headers: { 'x-api-token': TOKEN } })
    expect(res.status).toBe(200)
  })

  it('leaves /api/health open so the platform healthcheck still works', async () => {
    envMock.API_TOKEN = TOKEN
    const app = await guardedApp()

    // Railway polls this to decide whether the deploy is alive; a 401 here reads as "dead".
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
  })

  it('says nothing about why the token failed', async () => {
    envMock.API_TOKEN = TOKEN
    const app = await guardedApp()

    const res = await app.request('/api/live/games', { headers: { 'x-api-token': 'wrong' } })
    const body = (await res.json()) as Record<string, unknown>

    expect(Object.keys(body)).toEqual(['error'])
    expect(body.error).toBe('Unauthorized')
  })
})
