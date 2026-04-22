import { describe, it, expect, vi, beforeEach } from 'vitest'

// Shared mock Redis instance — created once, referenced by both the factory and tests
const mockRedisInstance = {
  get: vi.fn(),
  set: vi.fn(),
  on: vi.fn(),
}

// Mock ioredis before importing cache.
// cache.ts uses `import { Redis } from 'ioredis'` so we export Redis as a named constructor.
vi.mock('ioredis', () => {
  const RedisMock = vi.fn(() => mockRedisInstance)
  return { Redis: RedisMock, default: RedisMock }
})

// Mock env module
vi.mock('./env.js', () => ({
  env: {
    PORT: '3001',
    UPSTASH_REDIS_URL: 'rediss://test.upstash.io:6380',
    UPSTASH_REDIS_TOKEN: 'test-token',
    VALVE_API_KEY: 'test-key',
  },
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
  let mockRedis: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> }
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
})
