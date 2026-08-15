import { describe, it, expect } from 'vitest'
import { computeWinProbInterval, resolveWinProbInterval } from './useWinProbability'

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

// ─── C-1 regression: the poll must not decide its own cadence ────────────────────────
//
// The bug: refetchInterval read gameState/duration from THIS query's last response. The
// gate says "not past 5 minutes → don't poll", so the query never refetched, so the
// response never advanced past the draft, so the gate stayed shut for the entire match.
// A window refocus was the only thing that ever broke the loop.
//
// The rule: the match's own clock (polled independently by useMatchState) wins; the
// query's own data is only a fallback for callers that pass nothing.
describe('resolveWinProbInterval (C-1 — cadence comes from outside the query)', () => {
  it('starts polling once the LIVE clock passes 5 minutes, even though the last response was the draft', () => {
    const staleDraftResponse = { gameState: 2, duration: 0 }
    expect(resolveWinProbInterval({ gameState: 5, duration: 400 }, staleDraftResponse)).toBe(30_000)
  })

  it('would have stayed frozen using the response alone (the bug, pinned)', () => {
    const staleDraftResponse = { gameState: 2, duration: 0 }
    expect(resolveWinProbInterval(undefined, staleDraftResponse)).toBe(false)
  })

  it('live state also stops the poll the moment the match ends, before the next response', () => {
    const inGameResponse = { gameState: 5, duration: 2000 }
    expect(resolveWinProbInterval({ gameState: 6, duration: 2100 }, inGameResponse)).toBe(false)
  })

  it('falls back to the response when the caller passes no live state', () => {
    expect(resolveWinProbInterval(undefined, { gameState: 5, duration: 400 })).toBe(30_000)
  })

  it('tolerates the nulls the BFF actually sends for an unknown match', () => {
    expect(resolveWinProbInterval({}, { gameState: null, duration: null })).toBe(false)
  })
})
