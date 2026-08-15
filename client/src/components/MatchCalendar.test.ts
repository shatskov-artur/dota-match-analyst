import { describe, it, expect } from 'vitest'
import { dayKey, monthGrid } from './MatchCalendar'
import { format } from 'date-fns'

describe('monthGrid', () => {
  it('always returns six full weeks so the grid never changes height', () => {
    for (const month of [0, 1, 7, 11]) {
      expect(monthGrid(new Date(2026, month, 15))).toHaveLength(42)
    }
    // February 2026 starts on a Sunday — the case that needs the sixth row least and the
    // leading week most.
    expect(monthGrid(new Date(2026, 1, 15))).toHaveLength(42)
  })

  it('starts each week on Monday', () => {
    const grid = monthGrid(new Date(2026, 7, 15))
    for (let i = 0; i < 42; i += 7) expect(format(grid[i], 'EEE')).toBe('Mon')
  })

  it('covers the whole month with leading and trailing days', () => {
    const grid = monthGrid(new Date(2026, 7, 15)) // August 2026 begins on a Saturday
    const keys = grid.map((d) => dayKey(d))
    expect(keys).toContain('2026-08-01')
    expect(keys).toContain('2026-08-31')
    // The row holding 1 August also holds the July days that share its week.
    expect(keys[0] < '2026-08-01').toBe(true)
  })
})

describe('dayKey', () => {
  it('keys on the reader clock, not UTC', () => {
    // 02:00 local must stay on its own day — bucketing on UTC moves it back one for
    // everyone east of the meridian, which is the bug this key exists to avoid.
    const early = Math.floor(new Date(2026, 7, 15, 2, 0, 0).getTime() / 1000)
    expect(dayKey(early)).toBe('2026-08-15')
    const late = Math.floor(new Date(2026, 7, 15, 23, 30, 0).getTime() / 1000)
    expect(dayKey(late)).toBe('2026-08-15')
  })

  it('accepts a Date as well as an epoch', () => {
    expect(dayKey(new Date(2026, 7, 9))).toBe('2026-08-09')
  })
})
