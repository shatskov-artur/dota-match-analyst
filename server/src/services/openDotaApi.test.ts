import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock ioredis and env BEFORE importing cached() dependencies.
// Pattern from cache.test.ts (Phase 1) — must mock before any dynamic import.
vi.mock('ioredis', () => {
  const RedisMock = vi.fn(function () {
    return { get: vi.fn(), set: vi.fn(), on: vi.fn() }
  })
  return { Redis: RedisMock, default: RedisMock }
})

vi.mock('../env.js', () => ({
  env: {
    PORT: '3001',
    UPSTASH_REDIS_URL: 'rediss://test.upstash.io:6380',
    UPSTASH_REDIS_TOKEN: 'test-token',
    VALVE_API_KEY: 'test-key',
  },
}))

// Red-state stub (Phase 5 Wave 0, Nyquist contract per 05-VALIDATION.md).
// Until Plan 05-02 creates getHeroStats() in openDotaApi.ts, dynamic import fails → RED.
// After Plan 05-02: all assertions must be GREEN (DRAFT-03 heroStats transform contract).
//
// heroStats transform rules (from 05-CONTEXT.md D-10, 05-RESEARCH.md §Pitfall 7):
//   - Input: array of { id, pro_win, pro_pick } objects from OpenDota /api/heroStats
//   - Output: map keyed by hero_id (using `id` field) → { win_rate, pick_rate }
//   - Guard: skip entries where pro_pick === 0 (division-by-zero protection)
//   - Guard: accept EITHER `id` OR `hero_id` field (defensive — field name assumption A1)

// ─── B-1 regression: a transient upstream failure must never become cached data ──────
//
// The bug this pins down: every fetcher used to `return null` on a 5xx, and cached()
// stores whatever a fetcher returns — so ONE OpenDota blip filed "no data" under the key
// for the full TTL (six hours for hero stats). The upstream recovered; the app did not.
//
// The contract now: a real miss (404, 200-with-empty-body) returns null and IS cached;
// an outage THROWS and is therefore never cached.
describe('B-1 — transient failures throw, real misses return null', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('getHeroStats throws on a 502 instead of caching a null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, statusText: 'Bad Gateway' }))
    const { getHeroStats } = await import('./openDotaApi.js')
    await expect(getHeroStats()).rejects.toThrow(/unavailable/i)
  })

  it('getLeagueName throws on a 503 instead of pinning the fallback label for 6h', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' }))
    const { getLeagueName } = await import('./openDotaApi.js')
    await expect(getLeagueName(19719)).rejects.toThrow(/unavailable/i)
  })

  it('getLeagueName returns null (cacheable miss) on a 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }))
    const { getLeagueName } = await import('./openDotaApi.js')
    await expect(getLeagueName(1)).resolves.toBeNull()
  })

  it('getTeamMatches returns null on OpenDota’s 200-with-empty-body (CLAUDE.md pitfall)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' }))
    const { getTeamMatches } = await import('./openDotaApi.js')
    await expect(getTeamMatches(2163)).resolves.toBeNull()
  })

  it('getTeamMatches throws on a 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' }))
    const { getTeamMatches } = await import('./openDotaApi.js')
    await expect(getTeamMatches(2163)).rejects.toThrow(/unavailable/i)
  })
})

describe('getHeroStats transform (DRAFT-03 — heroStats map + zero-pick guard)', () => {
  it('transforms heroStats array into a map keyed by hero id', async () => {
    const { buildHeroStatsMap } = await import('./openDotaApi.js')
    const raw = [
      { id: 1, pro_win: 52, pro_pick: 100 },
      { id: 14, pro_win: 40, pro_pick: 80 },
    ]
    const result = buildHeroStatsMap(raw)
    expect(result[1]).toBeDefined()
    expect(result[1].win_rate).toBeCloseTo(0.52)
    expect(result[1].pick_rate).toBe(100)
    expect(result[14].win_rate).toBeCloseTo(0.5)
  })

  it('skips heroes where pro_pick === 0 (division-by-zero guard — Pitfall 7)', async () => {
    const { buildHeroStatsMap } = await import('./openDotaApi.js')
    const raw = [
      { id: 1, pro_win: 52, pro_pick: 100 },
      { id: 99, pro_win: 0, pro_pick: 0 },   // new hero — never picked in pro
    ]
    const result = buildHeroStatsMap(raw)
    expect(result[1]).toBeDefined()
    expect(result[99]).toBeUndefined()
  })

  it('falls back to hero_id field when id is absent (defensive — assumption A1)', async () => {
    const { buildHeroStatsMap } = await import('./openDotaApi.js')
    const raw = [
      { hero_id: 5, pro_win: 30, pro_pick: 60 },  // uses hero_id not id
    ]
    const result = buildHeroStatsMap(raw)
    expect(result[5]).toBeDefined()
    expect(result[5].win_rate).toBeCloseTo(0.5)
  })
})
