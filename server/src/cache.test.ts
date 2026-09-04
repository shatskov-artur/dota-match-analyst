import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logThrottle } from './logger.js'

// Shared mock Redis instance — created once, referenced by both the factory and tests.
// Signatures spelled out rather than left as bare vi.fn(): an untyped mock is inferred as
// void-returning, so handing it the async implementation these tests need reads as a
// promise dropped on the floor.
const mockRedisInstance = {
  get: vi.fn<(key: string) => Promise<string | null>>(),
  set: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  on: vi.fn<(...args: unknown[]) => unknown>(),
}

// Mock ioredis before importing cache.
// cache.ts uses `import { Redis } from 'ioredis'` so we export Redis as a named constructor.
vi.mock('ioredis', () => {
  const RedisMock = vi.fn(function () { return mockRedisInstance })
  return { Redis: RedisMock, default: RedisMock }
})

// Mock env module. STRATZ_TOKEN added — env.ts:8 now requires it.
vi.mock('./env.js', () => ({
  env: {
    PORT: '3001',
    UPSTASH_REDIS_URL: 'rediss://test.upstash.io:6380',
    UPSTASH_REDIS_TOKEN: 'test-token',
    VALVE_API_KEY: 'test-key',
    STRATZ_TOKEN: 'test-token',
  },
}))

// Mock the logger module so logThrottle is spyable and no real pino output is emitted.
vi.mock('./logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
  logThrottle: vi.fn(),
}))

describe('TTL constants', () => {
  it('TTL.LIVE_MATCH is 30', async () => {
    const { TTL } = await import('./cache.js')
    expect(TTL.LIVE_MATCH).toBe(30)
  })

  it('TTL.HERO_STATS is 21600', async () => {
    const { TTL } = await import('./cache.js')
    expect(TTL.HERO_STATS).toBe(21600)
  })

  it('TTL.PLAYER_STATS is 900', async () => {
    const { TTL } = await import('./cache.js')
    expect(TTL.PLAYER_STATS).toBe(900)
  })
})

describe('cached()', () => {
  let mockRedis: typeof mockRedisInstance
  let cachedFn: typeof import('./cache.js')['cached']

  beforeEach(async () => {
    // Reset all call history on the shared mock instance before each test
    mockRedisInstance.get.mockReset()
    mockRedisInstance.set.mockReset()
    mockRedisInstance.on.mockReset()

    mockRedis = mockRedisInstance

    const cacheModule = await import('./cache.js')
    cachedFn = cacheModule.cached
  })

  it('returns cached value on cache hit, fn() not called', async () => {
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ data: 'cached' }))

    const fn = vi.fn().mockResolvedValue({ data: 'fresh' })
    const result = await cachedFn('test-key', 30, fn)

    expect(result).toEqual({ data: 'cached' })
    expect(fn).not.toHaveBeenCalled()
    expect(mockRedis.get).toHaveBeenCalledWith('test-key')
  })

  it('calls fn() on cache miss and stores result in Redis', async () => {
    mockRedis.get.mockResolvedValueOnce(null)
    mockRedis.set.mockResolvedValueOnce('OK')

    const fn = vi.fn().mockResolvedValue({ data: 'fresh' })
    const result = await cachedFn('test-key', 30, fn)

    expect(result).toEqual({ data: 'fresh' })
    expect(fn).toHaveBeenCalledOnce()
    expect(mockRedis.set).toHaveBeenCalledWith('test-key', JSON.stringify({ data: 'fresh' }), 'EX', 30)
  })

  it('calls fn() twice on cache miss after TTL expires (get returns null both times)', async () => {
    mockRedis.get.mockResolvedValue(null)
    mockRedis.set.mockResolvedValue('OK')

    const fn = vi.fn().mockResolvedValue({ data: 'fresh' })

    await cachedFn('test-key', 30, fn)
    await cachedFn('test-key', 30, fn)

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('propagates fn() error without writing to Redis', async () => {
    mockRedis.get.mockResolvedValueOnce(null)

    const fn = vi.fn().mockRejectedValue(new Error('upstream error'))

    await expect(cachedFn('test-key', 30, fn)).rejects.toThrow('upstream error')
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  it('falls through to fn() when Redis GET throws (graceful degradation)', async () => {
    mockRedis.get.mockRejectedValueOnce(new Error('Redis connection error'))
    mockRedis.set.mockResolvedValueOnce('OK')

    const fn = vi.fn().mockResolvedValue({ data: 'fresh' })
    const result = await cachedFn('test-key', 30, fn)

    expect(result).toEqual({ data: 'fresh' })
    expect(fn).toHaveBeenCalledOnce()
  })

  it('writes both key and stale:<key> on a successful miss', async () => {
    mockRedis.get.mockResolvedValue(null)
    mockRedis.set.mockResolvedValue('OK')

    const fn = vi.fn().mockResolvedValue({ data: 'fresh' })
    await cachedFn('test-key', 30, fn)

    expect(mockRedis.set).toHaveBeenCalledWith('test-key', JSON.stringify({ data: 'fresh' }), 'EX', 30)
    // 24h stale copy for the exhaustion fallback (Pitfall 1).
    expect(mockRedis.set).toHaveBeenCalledWith('stale:test-key', JSON.stringify({ data: 'fresh' }), 'EX', 86_400)
  })
})

// ─── Backoff / throttle / stale behavior (2b/2c/2d) ─────────────────────────────
describe('cached() rate-limit backoff, throttle logging, and stale fallback', () => {
  let mockRedis: typeof mockRedisInstance
  let cachedFn: typeof import('./cache.js')['cached']

  const rateLimit = (retryAfterMs?: number) =>
    Object.assign(new Error('429'), { status: 429, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) })

  beforeEach(async () => {
    vi.useFakeTimers()
    mockRedisInstance.get.mockReset()
    mockRedisInstance.set.mockReset()
    mockRedisInstance.on.mockReset()
    vi.mocked(logThrottle).mockReset()

    mockRedis = mockRedisInstance
    const cacheModule = await import('./cache.js')
    cachedFn = cacheModule.cached
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // 2b: a 429 is retried (fn called >1×) then succeeds; a non-429 is NOT retried and propagates.
  it('retries a 429 with backoff then succeeds', async () => {
    mockRedis.get.mockResolvedValue(null)
    mockRedis.set.mockResolvedValue('OK')

    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimit())
      .mockRejectedValueOnce(rateLimit())
      .mockResolvedValue({ data: 'fresh' })

    const promise = cachedFn('test-key', 30, fn)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toEqual({ data: 'fresh' })
    expect(fn.mock.calls.length).toBeGreaterThan(1)
  })

  it('does NOT retry a non-429 error (fn called exactly once)', async () => {
    mockRedis.get.mockResolvedValue(null)

    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }))

    const promise = cachedFn('test-key', 30, fn)
    const assertion = expect(promise).rejects.toThrow('not found')
    await vi.runAllTimersAsync()
    await assertion

    expect(fn).toHaveBeenCalledOnce()
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  // 2c: each failed attempt calls logThrottle with status-only fields, NO url/key/token.
  it('logs each throttle event with status-only fields and no secret keys', async () => {
    mockRedis.get.mockResolvedValue(null)
    mockRedis.set.mockResolvedValue('OK')

    const fn = vi.fn().mockRejectedValueOnce(rateLimit()).mockResolvedValue({ data: 'fresh' })

    const promise = cachedFn('test-key', 30, fn, { upstream: 'stratz' })
    await vi.runAllTimersAsync()
    await promise

    expect(logThrottle).toHaveBeenCalled()
    const logged = vi.mocked(logThrottle).mock.calls[0][0]
    expect(logged).toEqual(
      expect.objectContaining({
        upstream: 'stratz',
        attempt: expect.any(Number),
        retriesLeft: expect.any(Number),
        status: 429,
      }),
    )
    expect(logged).toHaveProperty('delayMs')
    // SECURITY (T-11-02): no secret-bearing fields ever logged.
    expect(logged).not.toHaveProperty('url')
    expect(logged).not.toHaveProperty('key')
    expect(logged).not.toHaveProperty('token')
  })

  // 2d: on exhaustion, serve stale:<key> if present, else rethrow.
  it('serves stale:<key> when retries are exhausted and a stale copy exists', async () => {
    // Fresh key miss; stale copy present.
    mockRedis.get.mockImplementation((k: string) =>
      k === 'stale:test-key' ? Promise.resolve(JSON.stringify({ data: 'stale' })) : Promise.resolve(null),
    )

    const fn = vi.fn().mockRejectedValue(rateLimit())

    const promise = cachedFn('test-key', 30, fn)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toEqual({ data: 'stale' })
    expect(mockRedis.get).toHaveBeenCalledWith('stale:test-key')
  })

  it('rethrows when retries are exhausted and no stale copy exists', async () => {
    mockRedis.get.mockResolvedValue(null) // fresh miss AND stale miss

    const fn = vi.fn().mockRejectedValue(rateLimit())

    const promise = cachedFn('test-key', 30, fn)
    const assertion = expect(promise).rejects.toThrow('429')
    await vi.runAllTimersAsync()
    await assertion
  })
})
