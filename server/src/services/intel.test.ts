import { describe, it, expect, vi } from 'vitest'

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
    STRATZ_TOKEN: 'test-stratz-token',  // ADD: required for Phase 6 env validation
  },
}))

// Red-state stub (Phase 5 Wave 0, Nyquist contract per 05-VALIDATION.md).
// Until Plan 05-02 creates server/src/services/intel.ts, the import fails → RED.
// After Plan 05-02: all assertions must be GREEN.

describe('rankCounters (DRAFT-04 — counterpick ranking + disadvantage score)', () => {
  it('ranks matchups by wins/games_played descending and slices top-3', async () => {
    const { rankCounters } = await import('./intel.js')
    const matchups = [
      { hero_id: 10, games_played: 100, wins: 60 },  // score 0.60
      { hero_id: 20, games_played: 100, wins: 55 },  // score 0.55
      { hero_id: 30, games_played: 100, wins: 70 },  // score 0.70 — highest
      { hero_id: 40, games_played: 100, wins: 50 },  // score 0.50 — 4th, excluded
    ]
    const result = rankCounters(matchups)
    expect(result).toHaveLength(3)
    expect(result[0].heroId).toBe(30)
    expect(result[1].heroId).toBe(10)
    expect(result[2].heroId).toBe(20)
  })

  it('filters out matchups where games_played === 0 (division-by-zero guard)', async () => {
    const { rankCounters } = await import('./intel.js')
    const matchups = [
      { hero_id: 1, games_played: 0, wins: 0 },
      { hero_id: 2, games_played: 100, wins: 60 },
    ]
    const result = rankCounters(matchups)
    expect(result.every(r => r.heroId !== 1)).toBe(true)
  })

  it('accepts hero_id2 as fallback when hero_id is absent (assumption A3)', async () => {
    const { rankCounters } = await import('./intel.js')
    const matchups = [
      { hero_id2: 99, games_played: 50, wins: 30 },
    ]
    const result = rankCounters(matchups)
    expect(result[0]?.heroId).toBe(99)
  })
})

describe('applyKnownToPlay (DRAFT-04 — D-09 threshold: games >= 10 AND win/games > 0.5)', () => {
  it('returns true when games >= 10 AND win/games > 0.5', async () => {
    const { applyKnownToPlay } = await import('./intel.js')
    expect(applyKnownToPlay({ games: 10, win: 6 })).toBe(true)   // exactly at threshold
    expect(applyKnownToPlay({ games: 20, win: 11 })).toBe(true)
  })

  it('returns false when games < 10 (even if winrate is high)', async () => {
    const { applyKnownToPlay } = await import('./intel.js')
    expect(applyKnownToPlay({ games: 9, win: 9 })).toBe(false)
  })

  it('returns false when win/games <= 0.5 (even if games >= 10)', async () => {
    const { applyKnownToPlay } = await import('./intel.js')
    expect(applyKnownToPlay({ games: 10, win: 5 })).toBe(false)  // exactly 0.5 → false
    expect(applyKnownToPlay({ games: 10, win: 4 })).toBe(false)
  })

  it('returns false when games is 0 (division-by-zero guard)', async () => {
    const { applyKnownToPlay } = await import('./intel.js')
    expect(applyKnownToPlay({ games: 0, win: 0 })).toBe(false)
  })
})

describe('hidden-profile skip (PLAYER-02 — account_id = 4294967295 returns null stats)', () => {
  it('returns null player stats for hidden profile without making OpenDota call', async () => {
    const { buildPlayerIntelEntry } = await import('./intel.js')
    // Pass a mock that should NEVER be called for hidden profiles
    const mockFetch = vi.fn()
    const result = await buildPlayerIntelEntry(4294967295, 1, [], mockFetch)
    expect(result.stats).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not return null for a normal account_id', async () => {
    const { buildPlayerIntelEntry } = await import('./intel.js')
    const mockFetch = vi.fn().mockResolvedValue([{ hero_id: 1, games: 20, win: 12 }])
    const result = await buildPlayerIntelEntry(12345, 1, [], mockFetch)
    expect(mockFetch).toHaveBeenCalledWith(12345)
  })
})

describe('rankCountersStratz (MATCH-06 — Stratz nested advantage transform)', () => {
  it('returns top-3 counter heroes sorted by winRateHeroId1 ascending', async () => {
    const { rankCountersStratz } = await import('./intel.js')
    const advantage = [
      { heroId: 10, vs: [{ winRateHeroId1: 0.40 }] },  // worst matchup: heroId1 wins only 40%
      { heroId: 20, vs: [{ winRateHeroId1: 0.45 }] },
      { heroId: 30, vs: [{ winRateHeroId1: 0.42 }] },
      { heroId: 40, vs: [{ winRateHeroId1: 0.48 }] },  // 4th — excluded by top-3 slice
    ]
    const result = rankCountersStratz(advantage)
    expect(result).toHaveLength(3)
    expect(result[0].heroId).toBe(10)  // lowest winRateHeroId1 = hardest counter
    expect(result[1].heroId).toBe(30)
    expect(result[2].heroId).toBe(20)
  })

  it('filters out entries where heroId is 0 or missing', async () => {
    const { rankCountersStratz } = await import('./intel.js')
    const advantage = [
      { heroId: 0, vs: [{ winRateHeroId1: 0.30 }] },    // invalid — heroId 0 excluded
      { heroId: undefined, vs: [{ winRateHeroId1: 0.32 }] },  // invalid — no heroId
      { heroId: 15, vs: [{ winRateHeroId1: 0.44 }] },   // valid
    ]
    const result = rankCountersStratz(advantage)
    expect(result).toHaveLength(1)
    expect(result[0].heroId).toBe(15)
  })

  it('returns empty array when advantage is empty', async () => {
    const { rankCountersStratz } = await import('./intel.js')
    expect(rankCountersStratz([])).toEqual([])
  })

  it('disadvantageScore equals 1 - winRateHeroId1', async () => {
    const { rankCountersStratz } = await import('./intel.js')
    const advantage = [{ heroId: 7, vs: [{ winRateHeroId1: 0.40 }] }]
    const result = rankCountersStratz(advantage)
    expect(result[0].disadvantageScore).toBeCloseTo(0.60)
  })
})
