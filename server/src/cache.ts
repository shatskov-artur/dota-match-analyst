import { Redis } from 'ioredis'
import { env } from './env.js'

// ioredis connection using Upstash Redis-protocol endpoint with TLS.
// Upstash Redis URL format: rediss://HOST:PORT
// Construct the full connection URL by embedding the token as password:
// rediss://:TOKEN@HOST:PORT
// WR-01 fix: redisUrl construction is inside try block so malformed URL degrades gracefully.
let redis: Redis | null = null

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
  console.error('[cache] Failed to initialize Redis client — caching disabled:', err)
  redis = null
}

/**
 * TTL constants per data type (in seconds).
 * Per D-08: 30s live match data, 6h hero stats, 15min player stats.
 */
export const TTL = {
  LIVE_MATCH: 30,
  HERO_STATS: 21_600,  // 6 hours
  PLAYER_STATS: 900,   // 15 minutes
} as const

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
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
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

  const result = await fn()

  if (redis) {
    try {
      await redis.set(key, JSON.stringify(result), 'EX', ttlSeconds)
    } catch (err) {
      console.error(`[cache] SET error for key "${key}":`, (err as Error).message)
      // Do not rethrow — result was fetched successfully, caching failure is non-fatal
    }
  }

  return result
}
