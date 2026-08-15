import { describe, it, expect } from 'vitest'
import { ultimateStatus, xpToUltimate } from './CooldownsBlock'

/**
 * Values lifted from real TI 2026 snapshots (match 8946351114, minutes 20/30/35) and from
 * a live payload two minutes into match 8946650558. The panel was reading them through an
 * enum that does not exist, so every row said READY — including ultimates that were down
 * and level-1 heroes that have no ultimate at all.
 */
describe('ultimateStatus', () => {
  it('reads a positive cooldown as a cooldown, whatever state code comes with it', () => {
    // state 1 accompanies every cooldown in the real data; the old code waited for a 2.
    expect(ultimateStatus({ ultimate_state: 1, ultimate_cooldown: 62 }, 0)).toEqual({
      kind: 'cooldown',
      remaining: 62,
    })
    // Not tied to the enum: the number decides, so a renumbering cannot break it again.
    expect(ultimateStatus({ ultimate_state: 2, ultimate_cooldown: 30 }, 0)).toEqual({
      kind: 'cooldown',
      remaining: 30,
    })
  })

  it('counts the cooldown down between snapshots', () => {
    expect(ultimateStatus({ ultimate_state: 1, ultimate_cooldown: 62 }, 20)).toEqual({
      kind: 'cooldown',
      remaining: 42,
    })
    // Never negative, and it becomes ready rather than showing 0s forever.
    expect(ultimateStatus({ ultimate_state: 1, ultimate_cooldown: 10 }, 40)).toEqual({ kind: 'ready' })
  })

  it('reads state 3 with no cooldown as ready', () => {
    expect(ultimateStatus({ ultimate_state: 3, ultimate_cooldown: 0 }, 0)).toEqual({ kind: 'ready' })
  })

  it('reads state 0 as an ultimate that has not been learned', () => {
    // Every level 1-3 hero in a live payload reports this; calling it "ready" was a lie.
    expect(ultimateStatus({ ultimate_state: 0, ultimate_cooldown: 0 }, 0)).toEqual({ kind: 'locked' })
  })

  it('ignores a player Valve reports nothing about', () => {
    expect(ultimateStatus({}, 0)).toBeNull()
  })
})

describe('xpToUltimate', () => {
  it('recovers XP from xpm and the clock', () => {
    // 283 xpm at 5:00 → ~1415 XP, which is level 4 — matching the level Valve reported.
    expect(xpToUltimate(4, 283, 300)).toBe(2440 - 1415)
  })

  it('says nothing once the ultimate is available', () => {
    expect(xpToUltimate(6, 400, 600)).toBeNull()
    expect(xpToUltimate(12, 600, 1200)).toBeNull()
  })

  it('says nothing when the hero is already past the threshold on XP', () => {
    // Level lags the XP that earns it by a moment; no negative countdown either way.
    expect(xpToUltimate(5, 600, 600)).toBeNull()
  })

  it('says nothing without the inputs to derive it', () => {
    expect(xpToUltimate(undefined, 283, 300)).toBeNull()
    expect(xpToUltimate(4, undefined, 300)).toBeNull()
    expect(xpToUltimate(4, 283, undefined)).toBeNull()
    expect(xpToUltimate(4, 283, 0)).toBeNull()
  })
})
