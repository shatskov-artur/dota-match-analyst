import { describe, it, expect } from 'vitest'
import { computeIntelInterval } from './useMatchIntel'

// Red-state stub (Phase 5 Wave 0, Nyquist contract per 05-VALIDATION.md).
// Until Plan 05-04 creates client/src/hooks/useMatchIntel.ts, the import fails → RED.
// After Plan 05-04: all assertions must be GREEN (PLAYER-01 polling cadence contract).
//
// Pure helper pattern — mirrors computeDraftInterval in useDraftDetail.ts.
// The hook's refetchInterval callback delegates to computeIntelInterval(gameState)
// so cadence logic can be unit-tested without mounting React.
//
// Cadence contract (from 05-RESEARCH.md §Pattern 4):
//   game_state === 2 (draft)   → 5_000 ms   (match intel stays fresh during draft)
//   game_state === 6 (postgame)→ false       (CLAUDE.md: MUST stop on game_state === 6)
//   game_state === 5 (in-game) → false       (picks frozen — no new intel needed)
//   undefined / other          → false       (pre-data / lobby)

describe('computeIntelInterval (PLAYER-01 polling cadence)', () => {
  it('returns 5000ms when game_state === 2 (draft — intel must stay fresh)', () => {
    expect(computeIntelInterval(2)).toBe(5_000)
  })

  it('returns false when game_state === 6 (post-game — MUST stop per CLAUDE.md)', () => {
    expect(computeIntelInterval(6)).toBe(false)
  })

  it('returns false when game_state === 5 (in-game — picks frozen)', () => {
    expect(computeIntelInterval(5)).toBe(false)
  })

  it('returns false when game_state is undefined (first fetch in flight)', () => {
    expect(computeIntelInterval(undefined)).toBe(false)
  })

  it('returns false for unknown game_state values (fail-safe)', () => {
    expect(computeIntelInterval(99)).toBe(false)
    expect(computeIntelInterval(0)).toBe(false)
    expect(computeIntelInterval(1)).toBe(false)
  })
})
