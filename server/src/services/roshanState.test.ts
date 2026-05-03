import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 9 Plan 09-01 Wave 0 — RED tests for server/src/services/roshanState.ts
// Until plan 04 creates roshanState.ts the imports below fail and the suite is RED.
// After plan 04 every assertion below must pass (D-01..D-09 from 09-CONTEXT.md).

vi.mock('../cache.js', () => ({
  redis: { get: vi.fn(), set: vi.fn() },
}))

import { detectRoshanKill, readRoshanState, writeRoshanState } from './roshanState.js'
import { redis } from '../cache.js'

const NOW = 1_700_000_000_000 // fixed clock for deterministic kills timestamps
const GAME_TIME = 600

beforeEach(() => {
  vi.clearAllMocks()
})

describe('detectRoshanKill — pure detector (D-01..D-04)', () => {
  it('prev=null, cur=undefined → no scoreboard yet, no kill, fresh state', () => {
    const { state, killed } = detectRoshanKill(null, undefined, GAME_TIME, NOW)
    expect(killed).toBe(false)
    expect(state).toEqual({ killCount: 0, prevTimer: 0, kills: [] })
  })

  it('prev=null, cur=0 → mid-game alive join, no kill recorded', () => {
    const { state, killed } = detectRoshanKill(null, 0, GAME_TIME, NOW)
    expect(killed).toBe(false)
    expect(state).toEqual({ killCount: 0, prevTimer: 0, kills: [] })
  })

  it('prev=null, cur=300 → D-04 bootstrap: assume kill #1 already happened', () => {
    const { state, killed } = detectRoshanKill(null, 300, GAME_TIME, NOW)
    expect(killed).toBe(true)
    expect(state.killCount).toBe(1)
    expect(state.prevTimer).toBe(300)
    expect(state.kills).toHaveLength(1)
    expect(state.kills[0]).toEqual({ n: 1, gameTime: GAME_TIME, timestamp: NOW })
  })

  it('prev kill#1, cur=420 (0→>0 transition) → kill #2 detected', () => {
    const prev = { killCount: 1, prevTimer: 0, kills: [{ n: 1, gameTime: 300, timestamp: NOW - 60000 }] }
    const { state, killed } = detectRoshanKill(prev, 420, GAME_TIME, NOW)
    expect(killed).toBe(true)
    expect(state.killCount).toBe(2)
    expect(state.prevTimer).toBe(420)
    expect(state.kills).toHaveLength(2)
    expect(state.kills[1]).toEqual({ n: 2, gameTime: GAME_TIME, timestamp: NOW })
  })

  it('prev kill#1 with timer=300, cur=295 → counting down, no kill', () => {
    const prev = { killCount: 1, prevTimer: 300, kills: [{ n: 1, gameTime: 300, timestamp: NOW - 5000 }] }
    const { state, killed } = detectRoshanKill(prev, 295, GAME_TIME, NOW)
    expect(killed).toBe(false)
    expect(state.killCount).toBe(1)
    expect(state.prevTimer).toBe(295)
  })

  it('prev kill#2 timer=5, cur=0 → just respawned, no new kill', () => {
    const prev = { killCount: 2, prevTimer: 5, kills: [] }
    const { state, killed } = detectRoshanKill(prev, 0, GAME_TIME, NOW)
    expect(killed).toBe(false)
    expect(state.killCount).toBe(2)
    expect(state.prevTimer).toBe(0)
  })

  it('prev kill#2 timer=0, cur=0 → still alive, idempotent', () => {
    const prev = { killCount: 2, prevTimer: 0, kills: [] }
    const { state, killed } = detectRoshanKill(prev, 0, GAME_TIME, NOW)
    expect(killed).toBe(false)
    expect(state.killCount).toBe(2)
    expect(state.prevTimer).toBe(0)
  })

  it('prev kill#0 timer=0, cur=undefined → state mirrors prev, no kill', () => {
    const prev = { killCount: 0, prevTimer: 0, kills: [] }
    const { state, killed } = detectRoshanKill(prev, undefined, GAME_TIME, NOW)
    expect(killed).toBe(false)
    expect(state).toEqual(prev)
  })
})

describe('readRoshanState — Redis I/O (D-06..D-09)', () => {
  it('returns null when no key exists', async () => {
    vi.mocked(redis!.get).mockResolvedValue(null)
    const result = await readRoshanState(123)
    expect(result).toBeNull()
  })

  it('parses stored JSON correctly', async () => {
    const stored = { killCount: 2, prevTimer: 480, kills: [{ n: 1, gameTime: 300, timestamp: NOW }] }
    vi.mocked(redis!.get).mockResolvedValue(JSON.stringify(stored))
    const result = await readRoshanState(456)
    expect(result).toEqual(stored)
  })

  it('returns null on parse error / redis throw (graceful)', async () => {
    vi.mocked(redis!.get).mockResolvedValue('not-json{{')
    const result = await readRoshanState(789)
    expect(result).toBeNull()
  })
})

describe('writeRoshanState — Redis I/O (D-06..D-09)', () => {
  it('calls redis.set with key roshan:{matchId}, JSON value, EX 21600', async () => {
    const state = { killCount: 1, prevTimer: 480, kills: [{ n: 1, gameTime: 300, timestamp: NOW }] }
    await writeRoshanState(111, state)
    expect(redis!.set).toHaveBeenCalledWith(
      'roshan:111',
      JSON.stringify(state),
      'EX',
      21600,
    )
  })

  it('swallows redis errors (no throw)', async () => {
    vi.mocked(redis!.set).mockRejectedValue(new Error('boom'))
    await expect(writeRoshanState(222, { killCount: 0, prevTimer: 0, kills: [] }))
      .resolves.toBeUndefined()
  })
})

describe('match isolation (ROSH-04)', () => {
  it('different matchIds use different Redis keys', async () => {
    await writeRoshanState(111, { killCount: 1, prevTimer: 100, kills: [] })
    await writeRoshanState(222, { killCount: 2, prevTimer: 200, kills: [] })
    const calls = vi.mocked(redis!.set).mock.calls
    const keys = calls.map((c) => c[0])
    expect(keys).toContain('roshan:111')
    expect(keys).toContain('roshan:222')
  })
})
