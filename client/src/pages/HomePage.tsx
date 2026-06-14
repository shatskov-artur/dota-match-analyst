import { useMemo, useState } from 'react'
import MatchBentoGrid from '../components/MatchBentoGrid'
import MatchFilters from '../components/MatchFilters'
import SkeletonRow from '../components/SkeletonRow'
import ErrorBanner from '../components/ErrorBanner'
import { useLiveGames } from '../hooks/useLiveGames'
import { applyFilters, leagueOptions, DEFAULT_FILTERS } from '../utils/matchFilters'

export default function HomePage() {
  const { isLoading, isError, grouped, lastUpdatedLabel } = useLiveGames()
  const [filters, setFilters] = useState(DEFAULT_FILTERS)

  // Flatten all leagues into one list (league_name carried through for the card label + filter).
  const allMatches = useMemo(
    () =>
      grouped.flatMap(g =>
        g.matches.map(m => ({ ...m, league_name: m.league_name || g.leagueName })),
      ),
    [grouped],
  )

  const leagues = useMemo(() => leagueOptions(allMatches), [allMatches])
  const visible = useMemo(() => applyFilters(allMatches, filters), [allMatches, filters])

  // Total live matches across all leagues — drives the header live indicator (pre-filter).
  const liveCount = allMatches.length

  const hasData = allMatches.length > 0

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      {/* Page Header — responsive gutters, centered, flex-wrap so the live indicator
          never overflows on phone. */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 max-w-[1320px] mx-auto px-4 md:px-6 py-6 border-b border-border">
        <h1 className="text-primary text-2xl font-bold">Dota 2 Match Analyst</h1>

        {liveCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-label text-text-dim">
            <span className="w-[5px] h-[5px] rounded-full bg-dire animate-pulse" />
            {liveCount} live now
          </span>
        )}

        {lastUpdatedLabel && (
          <span className="ml-auto text-text-dim text-xs font-normal">{lastUpdatedLabel}</span>
        )}
      </header>

      <main className="max-w-[1320px] mx-auto px-4 md:px-6">
        {/* Loading state: bento skeleton tiles matching the final grid (no layout jump) */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-6
                          sm:[grid-auto-rows:minmax(150px,auto)] lg:[grid-auto-rows:minmax(160px,auto)]">
            <div className="flex sm:col-span-2 lg:col-span-2 lg:row-span-2">
              <SkeletonRow featured />
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        )}

        {/* Error state: blocking banner only on first-load failure (no stale data). */}
        {isError && !isLoading && !hasData && <ErrorBanner />}

        {/* Empty state: fetch succeeded but no live games at all */}
        {!isLoading && !isError && !hasData && (
          <div className="px-4 md:px-6 py-16 text-center">
            <h2 className="text-text text-xl font-bold">No live matches right now</h2>
            <p className="mt-2 text-text-muted text-sm font-normal">
              Pro tournament games appear here as they go live. This page refreshes every 30 seconds.
            </p>
          </div>
        )}

        {/* Filters + grid — only when there is data to filter */}
        {!isLoading && hasData && (
          <>
            <MatchFilters
              filters={filters}
              onChange={setFilters}
              leagues={leagues}
              resultCount={visible.length}
            />

            {visible.length > 0 ? (
              <MatchBentoGrid matches={visible} />
            ) : (
              <div className="px-4 md:px-6 py-16 text-center">
                <h2 className="text-text text-lg font-bold">No matches match your filters</h2>
                <p className="mt-2 text-text-muted text-sm">
                  Try clearing the search or switching the status filter.
                </p>
                <button
                  type="button"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="mt-5 inline-flex items-center px-5 py-2.5 rounded-full bg-primary text-white
                             text-sm font-semibold cursor-pointer hover:shadow-[0_0_22px_var(--color-primary-soft)] transition-shadow"
                >
                  Reset filters
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
