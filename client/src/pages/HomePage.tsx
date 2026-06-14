import MatchBentoGrid from '../components/MatchBentoGrid'
import SkeletonRow from '../components/SkeletonRow'
import ErrorBanner from '../components/ErrorBanner'
import { useLiveGames } from '../hooks/useLiveGames'

export default function HomePage() {
  const { isLoading, isError, grouped, lastUpdatedLabel } = useLiveGames()

  // Total live matches across all grouped leagues — drives the header live indicator.
  const liveCount = grouped.reduce((sum, g) => sum + g.matches.length, 0)

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      {/* Page Header — responsive gutters (16px phone → 24px tablet+), centered, flex-wrap so
          the live indicator never overflows on phone (UI-SPEC: wraps below brand). */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 max-w-[1180px] mx-auto px-4 md:px-6 py-6 border-b border-border">
        {/* UI-SPEC: gold wordmark (logo/brand is gold, not radiant green). */}
        <h1 className="text-primary text-2xl font-semibold">Dota 2 Match Analyst</h1>

        {/* Live indicator — "{N} live now" at Label size with a pulsing dot. */}
        {liveCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-label text-text-dim">
            <span className="w-[5px] h-[5px] rounded-full bg-radiant animate-pulse" />
            {liveCount} live now
          </span>
        )}

        {/* D-10: last-updated timestamp — time only, pushed to the right. */}
        {lastUpdatedLabel && (
          <span className="ml-auto text-text-dim text-xs font-normal">{lastUpdatedLabel}</span>
        )}
      </header>

      <main className="max-w-[1180px] mx-auto px-4 md:px-6">
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

        {/* Error state: blocking banner only on first-load failure (no stale data).
            Background refetch failures leave grouped populated — stale content stays visible. */}
        {isError && !isLoading && grouped.length === 0 && <ErrorBanner />}

        {/* Empty state: fetch succeeded but no live games */}
        {!isLoading && !isError && grouped.length === 0 && (
          <div className="px-4 md:px-6 py-16 text-center">
            {/* UI-SPEC copywriting contract: exact empty state copy */}
            <h2 className="text-text text-xl font-semibold">No live matches right now</h2>
            <p className="mt-2 text-text-muted text-sm font-normal">
              Pro tournament games appear here as they go live. This page refreshes every 30 seconds.
            </p>
          </div>
        )}

        {/* Match grid: show stale data even when background refetch errors */}
        {!isLoading && grouped.length > 0 && <MatchBentoGrid grouped={grouped} />}
      </main>
    </div>
  )
}
