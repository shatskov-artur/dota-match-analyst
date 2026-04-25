import { describe, it, expect } from 'vitest'
import { winrateColor } from './winrateColor'

// Red-state stub (Phase 5 Wave 0, Nyquist contract per 05-VALIDATION.md).
// Until Plan 05-04 creates client/src/utils/winrateColor.ts, the import fails → RED.
// After Plan 05-04: all assertions must be GREEN (DRAFT-03 badge color contract).
//
// Threshold rules (from 05-CONTEXT.md §Specific Ideas + 05-UI-SPEC.md §Color):
//   winRate > 0.52  → '#4ade80'  (radiant green — high winrate)
//   winRate < 0.48  → '#ef4444'  (dire red — low winrate)
//   0.48 ≤ winRate ≤ 0.52 → '#888888'  (neutral — near 50%)

describe('winrateColor (DRAFT-03 badge color threshold — per 05-UI-SPEC.md)', () => {
  it('returns radiant green (#4ade80) when winRate > 0.52', () => {
    expect(winrateColor(0.53)).toBe('#4ade80')
    expect(winrateColor(0.60)).toBe('#4ade80')
    expect(winrateColor(1.00)).toBe('#4ade80')
  })

  it('returns dire red (#ef4444) when winRate < 0.48', () => {
    expect(winrateColor(0.47)).toBe('#ef4444')
    expect(winrateColor(0.40)).toBe('#ef4444')
    expect(winrateColor(0.00)).toBe('#ef4444')
  })

  it('returns neutral grey (#888888) when winRate is exactly 0.52 (boundary — inclusive)', () => {
    expect(winrateColor(0.52)).toBe('#888888')
  })

  it('returns neutral grey (#888888) when winRate is exactly 0.48 (boundary — inclusive)', () => {
    expect(winrateColor(0.48)).toBe('#888888')
  })

  it('returns neutral grey (#888888) when winRate is between 0.48 and 0.52', () => {
    expect(winrateColor(0.50)).toBe('#888888')
    expect(winrateColor(0.51)).toBe('#888888')
    expect(winrateColor(0.49)).toBe('#888888')
  })
})
