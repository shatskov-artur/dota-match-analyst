import LeagueAccordion from '../components/LeagueAccordion'
import SkeletonRow from '../components/SkeletonRow'
import ErrorBanner from '../components/ErrorBanner'
import { useLiveGames } from '../hooks/useLiveGames'

export default function HomePage() {
  const { isLoading, isError, grouped, lastUpdatedLabel } = useLiveGames()

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Page Header — UI-SPEC: flex items-center justify-between px-8 py-6 border-b border-gray-800 */}
      <header className="flex items-center justify-between px-8 py-6 border-b border-gray-800">
        {/* UI-SPEC: text-green-400 text-2xl font-bold — matches existing App.tsx convention */}
        <h1 className="text-green-400 text-2xl font-bold">Dota 2 Match Analyst</h1>
        {/* D-10: last-updated timestamp — time only, no date */}
        {lastUpdatedLabel && (
          <span className="text-gray-400 text-xs font-normal">{lastUpdatedLabel}</span>
        )}
      </header>

      <main>
        {/* Loading state: 5 skeleton rows while initial data loads */}
        {isLoading && (
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        )}

        {/* Error state: full-width banner when BFF unreachable */}
        {isError && !isLoading && <ErrorBanner />}

        {/* Empty state: fetch succeeded but no live games */}
        {!isLoading && !isError && grouped.length === 0 && (
          <div className="px-8 py-16 text-center">
            {/* UI-SPEC copywriting contract: exact empty state copy */}
            <h2 className="text-white text-xl font-bold">No live matches right now</h2>
            <p className="mt-2 text-gray-400 text-sm font-normal">
              Valve reports no active tournament games. Check back during a scheduled event.
            </p>
          </div>
        )}

        {/* Match list: accordion sections per league */}
        {!isLoading && !isError && grouped.length > 0 && (
          <div>
            {grouped.map(({ leagueId, leagueName, matches }) => (
              <LeagueAccordion
                key={leagueId}
                leagueName={leagueName}
                matches={matches}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
