import { describe, it, expect } from 'vitest'
import { computeMatchInterval } from './useMatchDetail'

// Pure-helper cadence test (11-03, ROADMAP criterion 3 / D-11).
// Mirrors useWinProbability.test.ts template — the cadence logic is extracted into a
// pure helper so the game_state===6 → false guard can be unit-tested without mounting
// React or @tanstack/react-query.
//
// CRITICAL (CLAUDE.md §Critical Pitfalls): polling MUST stop on game_state === 6.
// Finished matches otherwise keep draining upstream quota. This assertion locks the
// guard so a future edit can't silently reintroduce post-game polling.
//
// Cadence contract (D-12 / D-14):
//   game_state === 6 (post-game) → false     (MUST stop)
//   anything else                → 30_000 ms (30s in-game cadence)

describe('computeMatchInterval (match detail polling cadence — per D-12/D-14)', () => {
  it('returns false when game_state === 6 (post-game — MUST stop per CLAUDE.md §Critical Pitfalls)', () => {
    expect(computeMatchInterval(6)).toBe(false)
  })

  it('returns 30000ms when game_state === 5 (in-game — polls)', () => {
    expect(computeMatchInterval(5)).toBe(30_000)
  })

  it('returns 30000ms when game_state is undefined (first fetch in flight)', () => {
    expect(computeMatchInterval(undefined)).toBe(30_000)
  })
})
