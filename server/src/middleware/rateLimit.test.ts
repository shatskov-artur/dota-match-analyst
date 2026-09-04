import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  briefError: (err: unknown) => String(err),
}))

import { rateLimit } from './rateLimit.js'

/** Distinct callers are distinct x-forwarded-for values, as a proxy would send them. */
function appWith(limit: number, windowMs = 60_000) {
  const app = new Hono()
  app.use('*', rateLimit({ windowMs, limit, name: 'test' }))
  app.get('/thing', (c) => c.json({ ok: true }))
  return app
}

const from = (ip: string) => ({ headers: { 'x-forwarded-for': ip } })

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('allows requests up to the limit and refuses the one after', async () => {
    const app = appWith(3)

    for (let i = 0; i < 3; i++) {
      const res = await app.request('/thing', from('1.1.1.1'))
      expect(res.status).toBe(200)
    }

    const blocked = await app.request('/thing', from('1.1.1.1'))
    expect(blocked.status).toBe(429)
  })

  it('answers 429 with a Retry-After the caller can act on', async () => {
    const app = appWith(1)
    await app.request('/thing', from('2.2.2.2'))

    const res = await app.request('/thing', from('2.2.2.2'))
    const retryAfter = Number(res.headers.get('Retry-After'))

    expect(res.status).toBe(429)
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(60)
  })

  it('counts each client separately', async () => {
    const app = appWith(1)

    expect((await app.request('/thing', from('3.3.3.3'))).status).toBe(200)
    // A second caller must not inherit the first one's exhausted budget.
    expect((await app.request('/thing', from('4.4.4.4'))).status).toBe(200)
    expect((await app.request('/thing', from('3.3.3.3'))).status).toBe(429)
  })

  it('takes the left-most entry of a proxy chain as the client', async () => {
    const app = appWith(1)

    await app.request('/thing', { headers: { 'x-forwarded-for': '5.5.5.5, 10.0.0.1' } })
    const res = await app.request('/thing', { headers: { 'x-forwarded-for': '5.5.5.5, 10.0.0.9' } })

    // Same origin client behind different proxy hops is still one client.
    expect(res.status).toBe(429)
  })

  it('lets the window expire and the caller through again', async () => {
    vi.useFakeTimers()
    const app = appWith(1, 1_000)

    expect((await app.request('/thing', from('6.6.6.6'))).status).toBe(200)
    expect((await app.request('/thing', from('6.6.6.6'))).status).toBe(429)

    vi.advanceTimersByTime(1_001)

    expect((await app.request('/thing', from('6.6.6.6'))).status).toBe(200)
    vi.useRealTimers()
  })

  it('collapses direct connections into one bucket rather than failing open', async () => {
    // No proxy header at all — a dev machine. A shared bucket still catches a poll loop;
    // treating every header-less caller as unlimited would not.
    const app = appWith(1)

    expect((await app.request('/thing')).status).toBe(200)
    expect((await app.request('/thing')).status).toBe(429)
  })

  it('reports the remaining budget on a successful request', async () => {
    const app = appWith(5)
    const res = await app.request('/thing', from('7.7.7.7'))

    expect(res.headers.get('RateLimit-Limit')).toBe('5')
    expect(res.headers.get('RateLimit-Remaining')).toBe('4')
  })
})
