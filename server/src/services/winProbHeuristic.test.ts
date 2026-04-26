import { describe, it, expect, vi } from 'vitest'

// Mock ioredis and env BEFORE importing any cached() dependencies.
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
    STRATZ_TOKEN: 'test-stratz-token',
  },
}))

// RED state: ./winProbHeuristic.js does not exist yet — all imports will fail.
// After Task 2 (GREEN): all assertions must pass.

describe('computeGoldWinProb', () => {
  it('equal gold (diff=0) → returns sigmoid(0.0335) ≈ 0.508 (non-zero intercept)', async () => {
    const { computeGoldWinProb } = await import('./winProbHeuristic.js')
    const result = computeGoldWinProb(0)
    // sigmoid(0.0335) = 1/(1+exp(-0.0335)) ≈ 0.5084
    expect(result).toBeGreaterThan(0.505)
    expect(result).toBeLessThan(0.515)
  })

  it('radiant +10,000 gold → clamped to 0.95', async () => {
    const { computeGoldWinProb } = await import('./winProbHeuristic.js')
    const result = computeGoldWinProb(10000)
    // sigmoid(0.0335 + 0.000267*10000) = sigmoid(2.7035) ≈ 0.937 → clamped to 0.95
    expect(result).toBe(0.95)
  })

  it('dire +10,000 gold (diff=-10000) → ≈ 0.067 (not clamped to 0.05)', async () => {
    const { computeGoldWinProb } = await import('./winProbHeuristic.js')
    const result = computeGoldWinProb(-10000)
    // sigmoid(0.0335 - 2.67) = sigmoid(-2.6365) ≈ 0.0668 → within [0.05, 0.95]
    expect(result).toBeGreaterThan(0.05)
    expect(result).toBeLessThan(0.10)
  })

  it('result is always between 0.05 and 0.95 inclusive (clamp test)', async () => {
    const { computeGoldWinProb } = await import('./winProbHeuristic.js')
    // Extreme values to verify clamp
    expect(computeGoldWinProb(100000)).toBe(0.95)
    expect(computeGoldWinProb(-100000)).toBe(0.05)
    expect(computeGoldWinProb(0)).toBeGreaterThanOrEqual(0.05)
    expect(computeGoldWinProb(0)).toBeLessThanOrEqual(0.95)
  })
})

describe('computeEstWinProb', () => {
  it('all inputs zero → sigmoid(0.0335) ≈ 0.508', async () => {
    const { computeEstWinProb } = await import('./winProbHeuristic.js')
    const result = computeEstWinProb({ goldDiff: 0, killDiff: 0, towerAdv: 0, raxAdv: 0 })
    expect(result).toBeGreaterThan(0.505)
    expect(result).toBeLessThan(0.515)
  })

  it('positive scenario: goldDiff=5000, killDiff=3, towerAdv=2, raxAdv=1 → clamped to 0.95', async () => {
    const { computeEstWinProb } = await import('./winProbHeuristic.js')
    const result = computeEstWinProb({ goldDiff: 5000, killDiff: 3, towerAdv: 2, raxAdv: 1 })
    // x = 0.0335 + 0.000267*5000 + 0.18*3 + 0.3*2 + 0.6*1
    //   = 0.0335 + 1.335 + 0.54 + 0.6 + 0.6 = 3.1085
    // sigmoid(3.1085) ≈ 0.957 → clamped to 0.95
    expect(result).toBe(0.95)
  })

  it('negative scenario: goldDiff=-3000, killDiff=-2, towerAdv=-1, raxAdv=0 → ≈ 0.194', async () => {
    const { computeEstWinProb } = await import('./winProbHeuristic.js')
    const result = computeEstWinProb({ goldDiff: -3000, killDiff: -2, towerAdv: -1, raxAdv: 0 })
    // x = 0.0335 - 0.801 - 0.36 - 0.3 + 0 = -1.4275
    // sigmoid(-1.4275) ≈ 0.194 → within [0.05, 0.95]
    expect(result).toBeGreaterThan(0.18)
    expect(result).toBeLessThan(0.21)
  })
})

describe('extractScoreboardInputs', () => {
  it('returns all zeros when game is undefined', async () => {
    const { extractScoreboardInputs } = await import('./winProbHeuristic.js')
    const result = extractScoreboardInputs(undefined)
    expect(result).toEqual({ goldDiff: 0, killDiff: 0, towerAdv: 0, raxAdv: 0 })
  })

  it('extracts goldDiff from radiant players net_worth sum minus dire players net_worth sum', async () => {
    const { extractScoreboardInputs } = await import('./winProbHeuristic.js')
    const game = {
      scoreboard: {
        radiant: { players: [{ net_worth: 3000 }, { net_worth: 4000 }] },
        dire: { players: [{ net_worth: 2000 }, { net_worth: 2500 }] },
      },
    }
    const result = extractScoreboardInputs(game as Record<string, unknown>)
    // radiant = 7000, dire = 4500, diff = 2500
    expect(result.goldDiff).toBe(2500)
  })

  it('extracts killDiff from radiant_score - dire_score (top-level game fields)', async () => {
    const { extractScoreboardInputs } = await import('./winProbHeuristic.js')
    const game = {
      radiant_score: 15,
      dire_score: 10,
    }
    const result = extractScoreboardInputs(game as Record<string, unknown>)
    expect(result.killDiff).toBe(5)
  })

  it('extracts towerAdv using buildingDecoder (radiant tower bits minus dire tower bits)', async () => {
    const { extractScoreboardInputs } = await import('./winProbHeuristic.js')
    // All radiant towers alive (0x7FF = 11 bits), 0 dire towers alive
    // tower_state lower 16 bits = radiant, upper 16 bits = dire
    // radiant all 11 alive: 0x7FF, dire all destroyed: 0x000
    // towerAdv = popcount(0x7FF) - popcount(0x000) = 11 - 0 = 11
    const game = {
      tower_state: 0x07FF,  // radiant = 0x7FF (11 towers), dire = 0x000 (0 towers)
    }
    const result = extractScoreboardInputs(game as Record<string, unknown>)
    expect(result.towerAdv).toBe(11)
  })

  it('extracts raxAdv using buildingDecoder (radiant rax bits minus dire rax bits)', async () => {
    const { extractScoreboardInputs } = await import('./winProbHeuristic.js')
    // radiant rax all 6 alive (0x3F), dire rax all destroyed (0x00)
    // barracks_state lower 8 bits = radiant, upper 8 bits = dire
    const game = {
      tower_state: 0x07FF07FF,  // both teams have towers (to avoid unavailable)
      barracks_state: 0x003F,   // radiant = 0x3F (6 rax), dire = 0x00 (0 rax)
    }
    const result = extractScoreboardInputs(game as Record<string, unknown>)
    expect(result.raxAdv).toBe(6)
  })
})
