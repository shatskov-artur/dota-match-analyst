import { useState } from 'react'
import { Link } from 'react-router'
import MatchCalendar from './MatchCalendar'
import { useTournaments } from '../hooks/useArchive'
import type { CalendarDay } from '../utils/day'
import type { LeagueOption, MatchFilterState, StatusFilter, TierFilter } from '../utils/matchFilters'
import { DEFAULT_FILTERS } from '../utils/matchFilters'

/**
 * Everything that narrows the match list, in one column beside it.
 *
 * The controls used to sit in a bar above the grid and the calendar only existed inside
 * the "upcoming" view, so picking a day meant leaving the live page. Day is the axis this
 * page is actually read along — which day, then which of that day's games — so the
 * calendar leads and the filters follow underneath it.
 *
 * Sticky: the grid is long and these are what you reach for while scrolling it.
 */

const STATUS_CHIPS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'draft', label: 'Draft' },
  { value: 'finished', label: 'Finished' },
  { value: 'upcoming', label: 'Upcoming' },
]

/**
 * How big a tournament is — the question the list could not answer.
 *
 * A weekday evening carries twenty amateur ladder games and four that matter, and until now
 * telling them apart meant recognising the tournament by name. The titles say tier because
 * that is what a reader of Dota knows; the values underneath are OpenDota's, and they are
 * the same ones the recorder decides by, so the filter and the archive cannot disagree.
 */
const TIER_CHIPS: Array<{ value: TierFilter; label: string; hint: string }> = [
  { value: 'all', label: 'Any tier', hint: 'Every tournament' },
  { value: 'tier1', label: 'Tier 1', hint: 'The International, Majors' },
  { value: 'tier23', label: 'Tier 2–3', hint: 'The professional circuit' },
  { value: 'other', label: 'Other', hint: 'Ladders, open qualifiers, and anything unrecognised' },
]

function Star({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" className="shrink-0">
      <path
        d="M8 1.6 L10 6 L14.6 6.5 L11.2 9.6 L12.2 14.2 L8 11.8 L3.8 14.2 L4.8 9.6 L1.4 6.5 L6 6 Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The leagues on screen, each with how many rows it accounts for, and a star.
 *
 * This was a popover with a checkbox list inside it. In a column there is room to simply
 * show it, and the star lives next to the name it belongs to rather than two clicks away.
 * Starred first: a star is the reader naming a tournament they care about, and it is the
 * same signal that floats those matches to the top of the grid.
 */
function LeagueList({
  leagues,
  picked,
  onPick,
  isStarred,
  onToggleStar,
}: {
  leagues: LeagueOption[]
  picked: number[]
  onPick: (ids: number[]) => void
  isStarred: (leagueId: number) => boolean
  onToggleStar: (leagueId: number) => void
}) {
  const [showAll, setShowAll] = useState(false)
  // Every league the archive knows about, not only those with something on today — the
  // header's tournament menu used to be the way to reach a quiet one, and it no longer is.
  const all = useTournaments()
  const others = (all.data?.tournaments ?? []).filter((t) => !leagues.some((l) => l.id === t.leagueId))

  const ordered = [...leagues].sort((a, b) => {
    const s = Number(isStarred(b.id)) - Number(isStarred(a.id))
    return s !== 0 ? s : b.count - a.count || a.name.localeCompare(b.name)
  })

  const toggle = (id: number) =>
    onPick(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] uppercase tracking-[0.12em] text-text-dim">Tournaments</span>
        {picked.length > 0 && (
          <button
            type="button"
            onClick={() => onPick([])}
            className="text-[11px] text-primary hover:underline cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {ordered.length === 0 && <p className="px-1 py-1 text-[12px] text-text-dim">Nothing on this day.</p>}

      <div className="max-h-[280px] overflow-y-auto scroll-slim flex flex-col">
        {ordered.map((l) => {
          const on = picked.includes(l.id)
          const starred = isStarred(l.id)
          return (
            <div
              key={l.id}
              className={
                'flex items-center gap-2 px-1.5 py-1.5 rounded-[7px] transition-colors ' +
                (on ? 'bg-[var(--color-primary-soft)]' : 'hover:bg-surface-2')
              }
            >
              <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(l.id)}
                  className="accent-[var(--color-primary)] cursor-pointer shrink-0"
                />
                <span className="text-[12px] text-text truncate" title={l.name}>
                  {l.name}
                </span>
                {/* Only for the tiers worth pointing at. Badging "Other" would put a label
                    on two thirds of an ordinary evening and say nothing by saying it. */}
                {(l.tier === 'tier1' || l.tier === 'tier23') && (
                  <span
                    className={
                      'shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-[0.08em] border ' +
                      (l.tier === 'tier1'
                        ? 'text-accent border-accent'
                        : 'text-text-muted border-border')
                    }
                    title={l.tier === 'tier1' ? 'Tier 1 — The International, Majors' : 'Tier 2–3 — professional circuit'}
                  >
                    {l.tier === 'tier1' ? 'T1' : 'T2'}
                  </span>
                )}
                <span className="ml-auto font-mono text-[11px] tabular-nums text-text-dim shrink-0">
                  {l.count}
                </span>
              </label>
              <button
                type="button"
                onClick={() => onToggleStar(l.id)}
                aria-pressed={starred}
                aria-label={starred ? `Unstar ${l.name}` : `Star ${l.name}`}
                className={
                  'shrink-0 transition-colors cursor-pointer ' +
                  (starred ? 'text-accent' : 'text-text-dim hover:text-accent')
                }
              >
                <Star filled={starred} />
              </button>
            </div>
          )
        })}
      </div>

      {others.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            aria-expanded={showAll}
            className="px-1.5 py-1 text-left text-[11px] text-text-dim hover:text-text transition-colors cursor-pointer"
          >
            {showAll ? '▾' : '▸'} all tournaments ({others.length})
          </button>
          {showAll && (
            <div className="max-h-[200px] overflow-y-auto scroll-slim flex flex-col">
              {others.map((t) => (
                <Link
                  key={t.leagueId}
                  to={`/tournament/${t.leagueId}`}
                  className="truncate rounded-[7px] px-1.5 py-1 text-[12px] text-text-muted hover:bg-surface-2 hover:text-text transition-colors"
                  title={t.name ?? undefined}
                >
                  {t.name ?? `League #${t.leagueId}`}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export interface MatchRailProps {
  filters: MatchFilterState
  onChange: (next: MatchFilterState) => void
  /** Which chips this day can answer. The rest are shown but inert. */
  enabled: Set<StatusFilter>
  leagues: LeagueOption[]
  isStarred: (leagueId: number) => boolean
  onToggleStar: (leagueId: number) => void
  /** Calendar. Omitted entirely in a demo build, where the archive does not exist. */
  calendar?: {
    days: Map<string, CalendarDay>
    selected: string | null
    onSelect: (key: string | null) => void
    anchor: Date
    onAnchorChange: (next: Date) => void
  }
  /** Rows after filtering, and before — the second is only shown when they differ. */
  resultCount: number
  totalCount: number
}

export default function MatchRail({
  filters,
  onChange,
  enabled,
  leagues,
  isStarred,
  onToggleStar,
  calendar,
  resultCount,
  totalCount,
}: MatchRailProps) {
  const set = (patch: Partial<MatchFilterState>) => onChange({ ...filters, ...patch })
  const dirty =
    filters.status !== 'all' ||
    filters.tier !== 'all' ||
    filters.leagueIds.length > 0 ||
    filters.search.trim() !== ''

  return (
    <aside className="flex flex-col gap-4 stack:sticky stack:top-4">
      {calendar && (
        <MatchCalendar
          days={calendar.days}
          selected={calendar.selected}
          onSelect={calendar.onSelect}
          anchor={calendar.anchor}
          onAnchorChange={calendar.onAnchorChange}
          resetLabel="Now"
          resetTotal={false}
        />
      )}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
        {STATUS_CHIPS.map((c) => {
          const active = filters.status === c.value
          const usable = enabled.has(c.value)
          return (
            <button
              key={c.value}
              type="button"
              aria-pressed={active}
              disabled={!usable}
              title={usable ? undefined : 'Nothing on this day is in that state'}
              onClick={() => set({ status: c.value })}
              className={[
                'px-3 py-1 rounded-full text-[12px] font-semibold transition-colors duration-150 border',
                active && usable
                  ? 'bg-primary text-white border-primary shadow-[0_0_18px_var(--color-primary-soft)] cursor-pointer'
                  : usable
                    ? 'bg-surface text-text-muted border-border hover:text-text hover:border-primary cursor-pointer'
                    : 'bg-surface text-text-dim border-border opacity-40 cursor-default',
              ].join(' ')}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      {/* Tier sits directly under status: both answer "which of these is worth opening",
          and it is the first cut on an evening with twenty ladder games on screen. */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by tournament tier">
        {TIER_CHIPS.map((c) => {
          const active = filters.tier === c.value
          return (
            <button
              key={c.value}
              type="button"
              aria-pressed={active}
              title={c.hint}
              onClick={() => set({ tier: c.value })}
              className={[
                'px-3 py-1 rounded-full text-[12px] font-semibold transition-colors duration-150 border cursor-pointer',
                active
                  ? 'bg-primary text-white border-primary shadow-[0_0_18px_var(--color-primary-soft)]'
                  : 'bg-surface text-text-muted border-border hover:text-text hover:border-primary',
              ].join(' ')}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      <label className="relative block">
        <span className="sr-only">Search by team</span>
        <input
          type="search"
          inputMode="search"
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Search team…"
          className="w-full h-[36px] rounded-full bg-surface border border-border pl-9 pr-3 text-sm text-text
                     placeholder:text-text-dim focus:outline-none focus:border-primary
                     focus:shadow-[0_0_0_1px_var(--color-primary)] transition-colors"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none" aria-hidden="true">⌕</span>
      </label>

      <LeagueList
        leagues={leagues}
        picked={filters.leagueIds}
        onPick={(ids) => set({ leagueIds: ids })}
        isStarred={isStarred}
        onToggleStar={onToggleStar}
      />

      {/* The header already carries the live count. This line only earns its place once a
          filter has made the two numbers different. */}
      {dirty && (
        <div className="flex items-center gap-3 text-[11px] text-text-dim">
          <span className="tabular-nums">
            {resultCount} of {totalCount}
          </span>
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_FILTERS })}
            className="ml-auto text-primary hover:underline cursor-pointer"
          >
            Reset
          </button>
        </div>
      )}
    </aside>
  )
}
