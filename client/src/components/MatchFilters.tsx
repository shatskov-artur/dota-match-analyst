import type { MatchFilterState, StatusFilter, SortMode } from '../utils/matchFilters'

interface MatchFiltersProps {
  filters: MatchFilterState
  onChange: (next: MatchFilterState) => void
  leagues: Array<{ id: number; name: string }>
  /** Count of matches after filtering — shown next to the controls. */
  resultCount: number
}

const STATUS_CHIPS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'draft', label: 'Draft' },
  { value: 'finished', label: 'Finished' },
]

/**
 * Neon Bento filter bar for the Home match grid: status chips, league dropdown,
 * team search, and a sort toggle. Controlled — all state lives in HomePage.
 */
export default function MatchFilters({ filters, onChange, leagues, resultCount }: MatchFiltersProps) {
  const set = (patch: Partial<MatchFilterState>) => onChange({ ...filters, ...patch })

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:flex-wrap py-4">
      {/* Status chips */}
      <div className="flex items-center gap-1.5" role="group" aria-label="Filter by status">
        {STATUS_CHIPS.map(c => {
          const active = filters.status === c.value
          return (
            <button
              key={c.value}
              type="button"
              aria-pressed={active}
              onClick={() => set({ status: c.value })}
              className={[
                'px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors duration-150 cursor-pointer border',
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

      {/* Team search */}
      <label className="relative flex-1 min-w-0 lg:max-w-[260px]">
        <span className="sr-only">Search by team</span>
        <input
          type="search"
          inputMode="search"
          value={filters.search}
          onChange={e => set({ search: e.target.value })}
          placeholder="Search team…"
          className="w-full h-[38px] rounded-full bg-surface border border-border pl-10 pr-4 text-sm text-text
                     placeholder:text-text-dim focus:outline-none focus:border-primary
                     focus:shadow-[0_0_0_1px_var(--color-primary)] transition-colors"
        />
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none" aria-hidden="true">⌕</span>
      </label>

      {/* League dropdown */}
      <label className="relative">
        <span className="sr-only">Filter by league</span>
        <select
          value={filters.leagueId === 'all' ? 'all' : String(filters.leagueId)}
          onChange={e => set({ leagueId: e.target.value === 'all' ? 'all' : Number(e.target.value) })}
          className="h-[38px] rounded-full bg-surface border border-border pl-4 pr-9 text-sm text-text
                     cursor-pointer focus:outline-none focus:border-primary appearance-none transition-colors
                     hover:border-primary max-w-[220px] truncate"
        >
          <option value="all">All tournaments</option>
          {leagues.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none text-[10px]" aria-hidden="true">▾</span>
      </label>

      {/* Sort toggle */}
      <div className="flex items-center gap-1.5" role="group" aria-label="Sort order">
        {([
          { value: 'liveFirst', label: 'Live first' },
          { value: 'duration', label: 'By duration' },
        ] as Array<{ value: SortMode; label: string }>).map(s => {
          const active = filters.sort === s.value
          return (
            <button
              key={s.value}
              type="button"
              aria-pressed={active}
              onClick={() => set({ sort: s.value })}
              className={[
                'px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors duration-150 cursor-pointer border',
                active
                  ? 'bg-surface-2 text-text border-primary'
                  : 'bg-surface text-text-dim border-border hover:text-text-muted',
              ].join(' ')}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Result count */}
      <span className="text-text-dim text-[12px] tabular-nums lg:ml-auto">
        {resultCount} {resultCount === 1 ? 'match' : 'matches'}
      </span>
    </div>
  )
}
