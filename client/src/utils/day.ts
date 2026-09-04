import { addDays, format, isValid, startOfMonth, startOfWeek } from 'date-fns'

/**
 * Days, as this app counts them.
 *
 * Days are LOCAL throughout, matching every other time on the site. Bucketing on UTC would
 * move an 02:00 series to the previous day for half the world — and the server deliberately
 * does no timezone arithmetic at all, so these boundaries are the only ones that exist.
 */

export interface CalendarDay {
  /** Local calendar day, yyyy-MM-dd. */
  key: string
  total: number
  live: number
  finished: number
  scheduled: number
}

export const dayKey = (d: Date | number): string =>
  format(typeof d === 'number' ? new Date(d * 1000) : d, 'yyyy-MM-dd')

/** The only shape a day key ever has. Anything else did not come from this app. */
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Whether a `?day=` value is a day at all.
 *
 * A URL parameter is whatever a visitor typed, and date-fns v4 answers an Invalid Date by
 * THROWING a RangeError rather than returning a placeholder string — so `?day=abc` reached
 * `format()` and took the whole page down with it.
 *
 * The instant checked is the same one every caller builds (`T12:00:00`, safely inside the
 * local day), so a value this accepts is one they can all use. The round trip through
 * `dayKey` is what rejects a well-shaped day that does not exist: V8 does not reject
 * `2026-02-31T12:00:00`, it silently rolls it forward to 3 March, and a day filter quietly
 * showing a different day than the URL names is worse than one that refuses.
 */
export function isValidDayParam(value: string | null): value is string {
  if (value === null || !DAY_KEY_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T12:00:00`)
  return isValid(parsed) && dayKey(parsed) === value
}

/**
 * Midnight-to-midnight of a local day, as unix seconds — the window the API takes.
 *
 * `to` is the last second OF this day, not the first second of the next: the server
 * filters with SQL `between`, which is inclusive at both ends, so sharing the boundary
 * put a series starting at exactly 00:00 into two days at once — counted twice in the
 * calendar's dots and listed under both.
 */
export function dayBounds(key: string): { from: number; to: number } {
  const start = new Date(`${key}T00:00:00`)
  return {
    from: Math.floor(start.getTime() / 1000),
    to: Math.floor(addDays(start, 1).getTime() / 1000) - 1,
  }
}

/**
 * Six weeks of dates covering the month, Monday first.
 *
 * Always six rows so the grid does not change height between months — a calendar that
 * resizes as you page through it makes the surrounding layout jump.
 */
export function monthGrid(anchor: Date): Date[] {
  const first = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
  return Array.from({ length: 42 }, (_, i) => addDays(first, i))
}

/** The window a month grid covers, as unix seconds. Inclusive end, as in dayBounds. */
export function monthBounds(anchor: Date): { from: number; to: number } {
  const grid = monthGrid(anchor)
  return {
    from: Math.floor(grid[0].getTime() / 1000),
    to: Math.floor(addDays(grid[41], 1).getTime() / 1000) - 1,
  }
}

/**
 * What a selected day means for the page.
 *
 * No day and today are the same view — "now" — because a live grid is only ever about
 * today. Everything else is a question the archive answers rather than the live feed.
 */
export type DayMode = 'now' | 'future' | 'past'

export function dayMode(day: string | null, today: Date = new Date()): DayMode {
  if (!day) return 'now'
  const t = dayKey(today)
  if (day === t) return 'now'
  return day < t ? 'past' : 'future'
}

export interface DayCountable {
  status: 'upcoming' | 'live' | 'finished'
}

/**
 * Series per local day, split by state — the numbers behind the calendar's dots.
 *
 * `time` returns the instant a row belongs to; rows without one belong to no day (Valve
 * leaves scheduled_time at 0 for unseeded slots) and are skipped rather than piled onto
 * whichever day happens to be selected.
 */
export function bucketByDay<T extends DayCountable>(
  items: readonly T[],
  time: (item: T) => number | null | undefined,
): Map<string, CalendarDay> {
  const map = new Map<string, CalendarDay>()
  for (const item of items) {
    const t = time(item)
    if (!t) continue
    const key = dayKey(t)
    const day = map.get(key) ?? { key, total: 0, live: 0, finished: 0, scheduled: 0 }
    day.total++
    if (item.status === 'live') day.live++
    else if (item.status === 'finished') day.finished++
    else day.scheduled++
    map.set(key, day)
  }
  return map
}
