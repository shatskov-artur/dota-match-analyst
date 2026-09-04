import { useMemo, useState } from 'react'
import { addMonths, format, isSameDay, isSameMonth } from 'date-fns'
import { dayKey, monthGrid, type CalendarDay } from '../utils/day'

/**
 * Month calendar for picking a day of play.
 *
 * A day strip works while a tournament is three days old and stops working the moment it
 * is not — and it cannot say anything about a day with no games, which is exactly what a
 * reader scanning a schedule wants to see. A month grid shows the shape of the event:
 * which days are played, which are rest days, where you are now.
 *
 * A day with no series is present but inert — it is information, not a dead control, so it
 * is rendered dim and is not focusable.
 */

export { dayKey, monthGrid, type CalendarDay }

export interface MatchCalendarProps {
  /** Keyed by yyyy-MM-dd. Days absent from the map have nothing on. */
  days: Map<string, CalendarDay>
  selected: string | null
  onSelect: (key: string | null) => void
  /**
   * The month on screen. Pass it (with `onAnchorChange`) when the caller fetches per
   * month; leave both out and the calendar keeps its own place, which is all a page with
   * the whole schedule already in hand needs.
   */
  anchor?: Date
  onAnchorChange?: (next: Date) => void
  /** Series with no published date — offered as a separate row when there are any. */
  undated?: number
  /** Label on the reset button. "All days" for a tournament, "Now" for the live page. */
  resetLabel?: string
  /**
   * Show the total beside the reset label. Off where the button means "back to live":
   * "NOW 206" reads as a count of what is on now, and it is the month's total.
   */
  resetTotal?: boolean
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function MatchCalendar({
  days,
  selected,
  onSelect,
  anchor,
  onAnchorChange,
  undated = 0,
  resetLabel = 'All days',
  resetTotal = true,
}: MatchCalendarProps) {
  // Open on the selected day, else on the month that actually holds games, else today.
  const initial = useMemo(() => {
    if (selected) return new Date(`${selected}T12:00:00`)
    const withPlay = [...days.keys()].sort()
    const now = new Date()
    const nowKey = dayKey(now)
    if (withPlay.includes(nowKey)) return now
    return withPlay.length > 0 ? new Date(`${withPlay[withPlay.length - 1]}T12:00:00`) : now
    // Only the first render seeds the uncontrolled anchor; after that paging owns it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [ownAnchor, setOwnAnchor] = useState(initial)
  const month = anchor ?? ownAnchor
  const page = (delta: number) => {
    const next = addMonths(month, delta)
    if (onAnchorChange) onAnchorChange(next)
    else setOwnAnchor(next)
  }

  const grid = useMemo(() => monthGrid(month), [month])
  const today = new Date()
  const totalAll = [...days.values()].reduce((n, d) => n + d.total, 0) + undated

  return (
    <div className="bento-card flex flex-col gap-3 w-full !p-4">
      {/*
       * UI-SPEC 10.5 D-9 (§6.3): 44×44 minimum hit area below `sm`. The arrows keep their
       * 24px bordered box — a month pager that grows to a 44px chrome block on phone reads
       * as the loudest thing on the card — so the extra 20px is a transparent ::before
       * expander instead. It reaches into the card's own padding and the (inert) month
       * label, never into another control.
       */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => page(-1)}
          className="relative w-6 h-6 grid place-items-center rounded-xs border border-border text-text-muted transition-colors hover:border-primary hover:text-text
                     max-sm:before:absolute max-sm:before:-inset-2.5 max-sm:before:content-['']"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-label uppercase tracking-label text-text">{format(month, 'LLLL yyyy')}</span>
        <button
          type="button"
          onClick={() => page(1)}
          className="relative w-6 h-6 grid place-items-center rounded-xs border border-border text-text-muted transition-colors hover:border-primary hover:text-text
                     max-sm:before:absolute max-sm:before:-inset-2.5 max-sm:before:content-['']"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-label uppercase tracking-label text-text-dim text-center pb-0.5">
            {w}
          </span>
        ))}

        {grid.map((date) => {
          const key = dayKey(date)
          const day = days.get(key)
          const inMonth = isSameMonth(date, month)
          const isToday = isSameDay(date, today)
          const isSelected = selected === key
          const playable = !!day

          const tone = isSelected
            ? 'border-primary bg-[var(--color-primary-soft)] text-text'
            : playable
              ? 'border-border text-text hover:border-primary'
              : 'border-transparent text-text-dim'

          /*
           * One dot, three meanings, in the order that decides what a day is worth
           * opening: something is on right now, something is scheduled, something was
           * played. Live keeps the one accent colour reserved for it.
           */
          const dot = !day
            ? null
            : day.live > 0
              ? 'var(--color-radiant)'
              : day.scheduled > 0
                ? 'var(--color-primary)'
                : 'var(--color-text-dim)'

          const label = day
            ? `${day.total} series${day.live > 0 ? `, ${day.live} live` : ''}`
            : undefined

          return (
            <button
              key={key}
              type="button"
              disabled={!playable}
              aria-pressed={isSelected}
              aria-label={`${format(date, 'd MMMM yyyy')}${day ? `, ${day.total} series` : ', no series'}`}
              onClick={() => onSelect(isSelected ? null : key)}
              title={label}
              className={
                /*
                 * UI-SPEC 10.5 D-9 (§6.3). A 7-column month grid inside the rail card is
                 * ~41px per cell at 375px. The expander claims exactly the 4px grid gap
                 * (2px from each side), so adjacent days touch but never overlap — no
                 * invisible zone can steal a tap from the day beside it.
                 */
                "relative aspect-square rounded-xs border font-mono text-label tabular-nums transition-colors " +
                "max-sm:before:absolute max-sm:before:-inset-0.5 max-sm:before:content-[''] " +
                (inMonth ? '' : 'opacity-40 ') +
                (playable ? 'cursor-pointer ' : 'cursor-default ') +
                tone
              }
              style={isToday && !isSelected ? { boxShadow: 'inset 0 0 0 1px var(--color-accent)' } : undefined}
            >
              {format(date, 'd')}
              {dot && (
                <span
                  className="absolute left-1/2 -translate-x-1/2 bottom-[3px] w-1 h-1 rounded-full"
                  style={{ background: dot }}
                />
              )}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => onSelect(null)}
        className={
          // D-9: full-width already, so only the height was short of the 44px floor.
          'rounded-sm border px-2 py-1.5 text-label uppercase tracking-label transition-colors cursor-pointer max-sm:min-h-11 ' +
          (selected === null
            ? 'border-primary bg-[var(--color-primary-soft)] text-text'
            : 'border-border text-text-muted hover:border-primary hover:text-text')
        }
      >
        {resetLabel}
        {resetTotal && <span className="ml-2 font-mono tabular-nums text-text-dim">{totalAll}</span>}
      </button>
    </div>
  )
}
