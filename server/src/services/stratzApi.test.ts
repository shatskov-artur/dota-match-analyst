import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock ioredis and env BEFORE importing cached() dependencies.
vi.mock('ioredis', () => {
  const RedisMock = vi.fn(function () {
    return { get: vi.fn().mockResolvedValue(null), set: vi.fn(), on: vi.fn() }
  })
  return { Redis: RedisMock, default: RedisMock }
})

vi.mock('../env.js', () => ({
  env: {
    PORT: '3001',
    UPSTASH_REDIS_URL: 'rediss://test.upstash.io:6380',
    UPSTASH_REDIS_TOKEN: 'test-token',
    VALVE_API_KEY: 'test-key',
    STRATZ_TOKEN: 'test-stratz-token',  // D-01: required field
  },
}))

// RED state: ./stratzApi does not exist yet — dynamic imports will fail until Plan 06-02.
// After Plan 06-02: all assertions must be GREEN (MATCH-06 Stratz null-return contract).

describe('getWinProbability (MATCH-06 — Stratz null-return safety)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const { getWinProbability } = await import('./stratzApi.js')
    const result = await getWinProbability(12345678)
    expect(result).toBeNull()
  })

  it('returns null when Stratz returns 401 (bad token)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    }))
    const { getWinProbability } = await import('./stratzApi.js')
    const result = await getWinProbability(12345678)
    expect(result).toBeNull()
  })

  it('returns null when liveWinRateValues is an empty array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { live: { match: { liveWinRateValues: [] } } },
      }),
    }))
    const { getWinProbability } = await import('./stratzApi.js')
    const result = await getWinProbability(12345678)
    expect(result).toBeNull()
  })

  it('returns the winRate of the last entry when liveWinRateValues is populated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          live: {
            match: {
              liveWinRateValues: [
                { time: 60, winRate: 0.55 },
                { time: 120, winRate: 0.68 },
              ],
            },
          },
        },
      }),
    }))
    const { getWinProbability } = await import('./stratzApi.js')
    const result = await getWinProbability(12345678)
    expect(result).toBeCloseTo(0.68)
  })
})
