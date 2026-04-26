import { describe, it, expect } from 'vitest'
import { computeWinProbInterval } from './useWinProbability'

// RED state: ./useWinProbability does not exist yet — this import will fail until Plan 06-04.
// After Plan 06-04: all assertions must be GREEN (MATCH-06 gate contract).
//
// CRITICAL (CLAUDE.md §Critical Pitfalls): game_state===6 check MUST be the FIRST guard.
// Polling on finished matches drains Stratz 500 req/hr quota.

describe('computeWinProbInterval (MATCH-06 — win prob polling gate)', () => {
  it('returns false for gameState===6 (postgame — MUST be first guard)', () => {
    expect(computeWinProbInterval(6, 600)).toBe(false)
  })

  it('returns 30000 when gameState===5 AND duration > 300', () => {
    expect(computeWinProbInterval(5, 400)).toBe(30_000)
    expect(computeWinProbInterval(5, 301)).toBe(30_000)
  })

  it('returns false when gameState===5 AND duration === 300 (boundary — not strictly > 300)', () => {
    expect(computeWinProbInterval(5, 300)).toBe(false)
  })

  it('returns false when gameState===5 AND duration < 300 (early-game gate)', () => {
    expect(computeWinProbInterval(5, 200)).toBe(false)
    expect(computeWinProbInterval(5, 0)).toBe(false)
  })

  it('returns false when gameState===5 AND duration is undefined', () => {
    expect(computeWinProbInterval(5, undefined)).toBe(false)
  })

  it('returns false for gameState===2 (draft phase — bar not visible)', () => {
    expect(computeWinProbInterval(2, 600)).toBe(false)
  })

  it('returns false when gameState is undefined (no data yet)', () => {
    expect(computeWinProbInterval(undefined, 600)).toBe(false)
  })
})
