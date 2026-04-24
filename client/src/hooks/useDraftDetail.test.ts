import { describe, it, expect } from 'vitest'
import { computeDraftInterval } from './useDraftDetail'

// Red-state test (Phase 4 Wave 0, Nyquist contract per 04-VALIDATION.md).
// Until Plan 03 creates client/src/hooks/useDraftDetail.ts and exports
// `computeDraftInterval`, the import fails and vitest reports red. After Plan 03
// all assertions turn green.
//
// Pure-helper pattern (matches the groupByLeague precedent in useLiveGames.ts):
// the hook's refetchInterval callback delegates to computeDraftInterval(gameState)
// so the cadence logic can be unit-tested without mounting React or calling
// @tanstack/react-query. This mirrors 04-PATTERNS.md §CRITICAL advisory.
//
// Cadence contract (D-12 + CLAUDE.md §Critical Pitfalls):
//   game_state === 2  → 5_000   (draft live — DRAFT-01 "~5s" criterion)
//   game_state === 5  → false   (in-game — scoreboard frozen)
//   game_state === 6  → false   (post-game — MUST stop per CLAUDE.md)
//   other / undefined → false   (lobby / pre-data — no polling)

describe('computeDraftInterval (DRAFT-01 polling cadence — per D-12)', () => {
  it('returns 5000ms when game_state === 2 (draft live)', () => {
    expect(computeDraftInterval(2)).toBe(5_000)
  })

  it('returns false when game_state === 6 (post-game — MUST stop per CLAUDE.md §Critical Pitfalls)', () => {
    expect(computeDraftInterval(6)).toBe(false)
  })

  it('returns false when game_state === 5 (in-game — scoreboard frozen)', () => {
    expect(computeDraftInterval(5)).toBe(false)
  })

  it('returns false when game_state is undefined (first fetch in flight)', () => {
    expect(computeDraftInterval(undefined)).toBe(false)
  })

  it('returns false when game_state === 1 (lobby — not draft yet)', () => {
    expect(computeDraftInterval(1)).toBe(false)
  })

  it('returns false for any unknown game_state (fail-safe)', () => {
    expect(computeDraftInterval(99)).toBe(false)
    expect(computeDraftInterval(0)).toBe(false)
  })
})
