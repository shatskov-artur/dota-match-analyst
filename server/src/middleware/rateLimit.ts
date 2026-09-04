import type { Context, MiddlewareHandler } from 'hono'
import { logger } from '../logger.js'

/**
 * Fixed-window rate limiter, in memory.
 *
 * `cache.ts` and `queues.ts` protect the UPSTREAMS from this process. Nothing protected
 * this process from its callers: CORS restricts a browser and does nothing to curl, so a
 * single loop against /api/live/intel/:id could spend a 500-an-hour Stratz budget in
 * minutes and blind the app for everyone.
 *
 * In memory is the correct scope here rather than a compromise. The BFF runs as one
 * instance, and what is being rationed is a per-process resource — the upstream quota
 * this process spends and the ten Postgres connections it holds. A Redis-backed counter
 * would add a round trip to every request to coordinate with replicas that do not exist.
 * If this ever runs multiple instances, the limit becomes per-instance and this comment
 * is the place that says so.
 */

interface Window {
  count: number
  resetAt: number
}

/** One map per limiter instance, so a route-specific limit cannot evict the global one. */
export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number
  /** Requests allowed per window per client. */
  limit: number
  /** Appears in the throttle log so two limiters are distinguishable. */
  name: string
}

/**
 * Who is being counted.
 *
 * Railway and every other reverse proxy set x-forwarded-for, whose left-most entry is the
 * original client. A direct connection has no such header, which on a dev machine collapses
 * every caller into one bucket — correct there, because the only caller is the developer and
 * a shared bucket still catches a runaway poll loop.
 *
 * The header is trivially spoofable when there is NO proxy in front. That is acceptable for
 * what this defends against: it bounds accidental and casual abuse, not a determined attacker,
 * who is anyway held off by API_TOKEN.
 */
function clientKey(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0].trim()
    if (first) return first
  }
  return c.req.header('x-real-ip')?.trim() || 'direct'
}

/** Drop expired windows so a long uptime cannot grow the map without bound. */
function sweep(windows: Map<string, Window>, now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key)
  }
}

export function rateLimit({ windowMs, limit, name }: RateLimitOptions): MiddlewareHandler {
  const windows = new Map<string, Window>()
  let nextSweep = 0

  return async (c, next) => {
    const now = Date.now()

    // Sweeping once per window beats sweeping per request, and never sweeping is how an
    // in-memory limiter turns into a memory leak on a public endpoint.
    if (now >= nextSweep) {
      sweep(windows, now)
      nextSweep = now + windowMs
    }

    const key = clientKey(c)
    const existing = windows.get(key)
    const window: Window =
      existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs }
    window.count++
    windows.set(key, window)

    const remaining = Math.max(0, limit - window.count)
    c.header('RateLimit-Limit', String(limit))
    c.header('RateLimit-Remaining', String(remaining))
    c.header('RateLimit-Reset', String(Math.ceil((window.resetAt - now) / 1000)))

    if (window.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((window.resetAt - now) / 1000))
      c.header('Retry-After', String(retryAfter))
      // Log the limiter and the path, never the key — it is a client IP.
      logger.warn({ limiter: name, path: c.req.path, count: window.count, limit }, 'rate limit exceeded')
      return c.json({ error: 'Too many requests', retryAfter }, 429)
    }

    await next()
  }
}
