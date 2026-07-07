import { Redis } from 'ioredis'
import pRetry from 'p-retry'
import type PQueue from 'p-queue'
import { env } from './env.js'
import { logThrottle } from './logger.js'

// ioredis connection using Upstash Redis-protocol endpoint with TLS.
// Upstash Redis URL format: rediss://HOST:PORT
// Construct the full connection URL by embedding the token as password:
// rediss://:TOKEN@HOST:PORT
// WR-01 fix: redisUrl construction is inside try block so malformed URL degrades gracefully.
export let redis: Redis | null = null

try {
  const redisUrl = `rediss://:${env.UPSTASH_REDIS_TOKEN}@${new URL(env.UPSTASH_REDIS_URL).host}`
  redis = new Redis(redisUrl, {
    tls: {},
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: false,
  })

  redis.on('error', (err: Error) => {
    // Log err.message only — never log the full Redis URL (contains embedded token)
    console.error('[cache] Redis connection error:', err.message)
  })
} catch (err) {
  console.error('[cache] Failed to initialize Redis client — caching disabled:', err instanceof Error ? err.message : String(err))
  redis = null
}

/**
 * TTL constants per data type (in seconds).
 * Per D-08: 30s live match data, 6h hero stats, 15min player stats.
 */
export const TTL = {
  LIVE_MATCH: 30,
  DRAFT: 4,            // D-15 — 1s below the 5s client poll cadence → every client poll sees fresh upstream
  HERO_STATS: 21_600,  // 6 hours
  PLAYER_STATS: 900,   // 15 minutes
  WIN_PROB: 60,        // D-07: 2× the 30s client poll cadence → 1 Stratz call/min per match
  STALE: 86_400,       // 24h long-lived stale copy for D-03 429-exhaustion fallback
} as const

/** Rate-limit predicate — only a 429 is retryable (Pitfall 2: never retry ZodError/404). */
function isRateLimited(err: unknown): boolean {
  return (err as { status?: number } | null | undefined)?.status === 429
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Wraps an async function with Redis caching.
 *
 * On cache hit:  returns cached JSON without calling fn.
 * On cache miss: calls fn, stores result as JSON with EX ttlSeconds, returns result.
 * On Redis GET error: falls through to fn (graceful degradation — never crash BFF).
 * On Redis SET error: logs error but returns result normally.
 * On fn() error: propagates error, nothing written to Redis.
 *
 * @param key        Unique cache key (should include all variance axes, e.g. "live-matches" or "player:12345")
 * @param ttlSeconds Cache duration in seconds. Use TTL constants.
 * @param fn         Async function that fetches the upstream data.
 * @param opts       Optional per-upstream queue + label. When `queue` is provided the fetch runs
 *                   inside that PQueue (rate-limit envelope). `upstream` tags throttle logs.
 *                   Backward-compatible: existing 3-arg calls behave exactly as before.
 *
 * On a 429 the fetch is retried with exponential backoff (honoring Retry-After when present);
 * non-429 errors are NOT retried. When retries are exhausted, a long-lived `stale:<key>` copy is
 * served if one exists, otherwise the error rethrows so the route emits 503 (D-03).
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
  opts?: { queue?: PQueue; upstream?: string },
): Promise<T> {
  if (redis) {
    try {
      const hit = await redis.get(key)
      if (hit !== null) {
        return JSON.parse(hit) as T
      }
    } catch (err) {
      console.error(`[cache] GET error for key "${key}":`, (err as Error).message)
      // Fall through to fn() — graceful degradation
    }
  }

  // Retry only 429s with exponential backoff; honor Retry-After additively (Pattern 2).
  const run = () =>
    pRetry(fn, {
      retries: 4,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 30_000,
      shouldRetry: ({ error }) => isRateLimited(error), // Pitfall 2: only 429s
      onFailedAttempt: async ({ error, attemptNumber, retriesLeft }) => {
        const status = (error as { status?: number }).status
        const retryAfterMs = (error as { retryAfterMs?: number | null }).retryAfterMs ?? null
        // SECURITY (T-11-02): status-only — never a url/key/token.
        logThrottle({ upstream: opts?.upstream ?? key, attempt: attemptNumber, retriesLeft, status, delayMs: retryAfterMs })
        if (retryAfterMs) await sleep(retryAfterMs) // honor Retry-After on top of pRetry backoff
      },
    })

  let result: T
  try {
    result = opts?.queue ? ((await opts.queue.add(run)) as T) : await run()
  } catch (err) {
    // D-03: retries exhausted → serve a long-lived stale copy if present, else rethrow (route emits 503).
    if (redis) {
      try {
        const stale = await redis.get('stale:' + key)
        if (stale !== null) return JSON.parse(stale) as T
      } catch {
        /* stale read failed — fall through to rethrow */
      }
    }
    throw err
  }

  if (redis) {
    try {
      await redis.set(key, JSON.stringify(result), 'EX', ttlSeconds)
      // Long-lived stale copy for the 429-exhaustion fallback (Pitfall 1: fresh key expires,
      // stale:<key> survives so the fallback can still fire during a storm).
      await redis.set('stale:' + key, JSON.stringify(result), 'EX', TTL.STALE)
    } catch (err) {
      console.error(`[cache] SET error for key "${key}":`, (err as Error).message)
      // Do not rethrow — result was fetched successfully, caching failure is non-fatal
    }
  }

  return result
}
