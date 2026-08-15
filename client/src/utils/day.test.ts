import { describe, it, expect } from 'vitest'
import { bucketByDay, dayBounds, dayKey, dayMode, monthBounds, monthGrid } from './day'

/** Local unix seconds for a local wall-clock moment — the only timezone this app counts in. */
const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  Math.floor(new Date(y, m - 1, d, h, min, 0).getTime() / 1000)

describe('dayKey', () => {
  it('names the local day, not the UTC one', () => {
    // 01:00 local on the 15th is the 14th in UTC for a positive offset. Bucketing on UTC
    // moved every late-night series to the previous day.
    expect(dayKey(at(2026, 8, 15, 1, 0))).toBe('2026-08-15')
    expect(dayKey(at(2026, 8, 15, 23, 30))).toBe('2026-08-15')
  })
})

describe('dayBounds', () => {
  it('spans one local day and ENDS INSIDE IT (B-3)', () => {
    const { from, to } = dayBounds('2026-08-15')
    // 86_399, not 86_400: the server filters with SQL `between`, which includes both ends.
    // Handing it the next midnight put a series starting at exactly 00:00 into two days —
    // dotted twice on the calendar and listed under both.
    expect(to - from).toBe(86_399)
    expect(dayKey(from)).toBe('2026-08-15')
    expect(dayKey(to)).toBe('2026-08-15')
  })

  it('leaves no gap between consecutive days', () => {
    // The seam has to be airtight in the other direction too: one second of the day must
    // not fall outside both windows.
    const first = dayBounds('2026-08-15')
    const second = dayBounds('2026-08-16')
    expect(second.from - first.to).toBe(1)
  })

  it('puts a midnight kickoff in exactly one day', () => {
    const midnight = at(2026, 8, 16, 0, 0)
    const fifteenth = dayBounds('2026-08-15')
    const sixteenth = dayBounds('2026-08-16')
    const within = (b: { from: number; to: number }) => midnight >= b.from && midnight <= b.to
    expect(within(fifteenth)).toBe(false)
    expect(within(sixteenth)).toBe(true)
  })
})

describe('monthGrid / monthBounds', () => {
  it('always draws six Monday-first weeks so the layout cannot jump', () => {
    for (const month of [1, 2, 8, 12]) {
      const grid = monthGrid(new Date(2026, month - 1, 15))
      expect(grid).toHaveLength(42)
      expect(grid[0].getDay()).toBe(1)
    }
  })

  it('bounds cover exactly the days drawn, inclusive at both ends', () => {
    const anchor = new Date(2026, 7, 15)
    const grid = monthGrid(anchor)
    const { from, to } = monthBounds(anchor)
    expect(dayKey(from)).toBe(dayKey(grid[0]))
    // Same inclusive-end rule as dayBounds, so the last drawn day is fully covered and the
    // first day of the NEXT month's grid is not double-counted.
    expect(to - from).toBe(42 * 86_400 - 1)
    expect(dayKey(to)).toBe(dayKey(grid[41]))
  })
})

describe('dayMode', () => {
  const today = new Date(2026, 7, 15, 15, 0, 0)

  it('treats no day and today as the same live view', () => {
    expect(dayMode(null, today)).toBe('now')
    expect(dayMode('2026-08-15', today)).toBe('now')
  })

  it('separates what was played from what is announced', () => {
    expect(dayMode('2026-08-14', today)).toBe('past')
    expect(dayMode('2026-07-31', today)).toBe('past')
    expect(dayMode('2026-08-16', today)).toBe('future')
    expect(dayMode('2026-09-01', today)).toBe('future')
  })
})

describe('bucketByDay', () => {
  const rows = [
    { status: 'finished' as const, time: at(2026, 8, 14, 20) },
    { status: 'finished' as const, time: at(2026, 8, 14, 22) },
    { status: 'live' as const, time: at(2026, 8, 15, 10) },
    { status: 'upcoming' as const, time: at(2026, 8, 15, 19) },
    { status: 'upcoming' as const, time: 0 },
    { status: 'upcoming' as const, time: null },
  ]

  it('splits each day by state', () => {
    const days = bucketByDay(rows, (r) => r.time)
    expect(days.get('2026-08-14')).toEqual({ key: '2026-08-14', total: 2, live: 0, finished: 2, scheduled: 0 })
    expect(days.get('2026-08-15')).toEqual({ key: '2026-08-15', total: 2, live: 1, finished: 0, scheduled: 1 })
  })

  it('drops rows that belong to no day rather than piling them onto one', () => {
    // Valve leaves scheduled_time at 0 for an unseeded slot; counting those as "today"
    // would dot a day nothing is on.
    const days = bucketByDay(rows, (r) => r.time)
    expect([...days.keys()].sort()).toEqual(['2026-08-14', '2026-08-15'])
  })

  it('is empty for no rows, not undefined', () => {
    expect(bucketByDay([], () => 0).size).toBe(0)
  })
})
