import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock ioredis before importing cache
vi.mock('ioredis', () => {
  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    on: vi.fn(),
  }
  return { default: vi.fn(() => mockRedis), __mockRedis: mockRedis }
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

  beforeEach(async () => {
    vi.resetModules()

    // Re-apply mocks after module reset
    vi.mock('ioredis', () => {
      const mockRedis = {
        get: vi.fn(),
        set: vi.fn(),
        on: vi.fn(),
      }
      return { default: vi.fn(() => mockRedis), __mockRedis: mockRedis }
    })

    vi.mock('./env.js', () => ({
      env: {
        PORT: '3001',
        UPSTASH_REDIS_URL: 'rediss://test.upstash.io:6380',
        UPSTASH_REDIS_TOKEN: 'test-token',
        VALVE_API_KEY: 'test-key',
      },
    }))

    const ioredis = await import('ioredis')
    // @ts-expect-error accessing mock internals
    mockRedis = ioredis.__mockRedis
  })

  it('returns cached value on cache hit, fn() not called', async () => {
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ data: 'cached' }))

    const { cached } = await import('./cache.js')
    const fn = vi.fn().mockResolvedValue({ data: 'fresh' })

    const result = await cached('test-key', 30, fn)

    expect(result).toEqual({ data: 'cached' })
    expect(fn).not.toHaveBeenCalled()
    expect(mockRedis.get).toHaveBeenCalledWith('test-key')
  })

  it('calls fn() on cache miss and stores result in Redis', async () => {
    mockRedis.get.mockResolvedValueOnce(null)
    mockRedis.set.mockResolvedValueOnce('OK')

    const { cached } = await import('./cache.js')
    const fn = vi.fn().mockResolvedValue({ data: 'fresh' })

    const result = await cached('test-key', 30, fn)

    expect(result).toEqual({ data: 'fresh' })
    expect(fn).toHaveBeenCalledOnce()
    expect(mockRedis.set).toHaveBeenCalledWith('test-key', JSON.stringify({ data: 'fresh' }), 'EX', 30)
  })

  it('calls fn() twice on cache miss after TTL expires (get returns null both times)', async () => {
    mockRedis.get.mockResolvedValue(null)
    mockRedis.set.mockResolvedValue('OK')

    const { cached } = await import('./cache.js')
    const fn = vi.fn().mockResolvedValue({ data: 'fresh' })

    await cached('test-key', 30, fn)
    await cached('test-key', 30, fn)

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('propagates fn() error without writing to Redis', async () => {
    mockRedis.get.mockResolvedValueOnce(null)

    const { cached } = await import('./cache.js')
    const fn = vi.fn().mockRejectedValue(new Error('upstream error'))

    await expect(cached('test-key', 30, fn)).rejects.toThrow('upstream error')
    expect(mockRedis.set).not.toHaveBeenCalled()
  })

  it('falls through to fn() when Redis GET throws (graceful degradation)', async () => {
    mockRedis.get.mockRejectedValueOnce(new Error('Redis connection error'))
    mockRedis.set.mockResolvedValueOnce('OK')

    const { cached } = await import('./cache.js')
    const fn = vi.fn().mockResolvedValue({ data: 'fresh' })

    const result = await cached('test-key', 30, fn)

    expect(result).toEqual({ data: 'fresh' })
    expect(fn).toHaveBeenCalledOnce()
  })
})
