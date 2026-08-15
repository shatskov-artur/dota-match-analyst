import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router'
import HomePage from './pages/HomePage'
import { BentoErrorBoundary } from './components/BentoErrorBoundary'

/**
 * Everything except the home page is loaded on demand.
 *
 * The whole app was one 794 kB chunk, so opening the match list paid for the playoff
 * bracket, the Swiss flow diagram and the 344 kB item table — none of which the home page
 * draws. The tournament view is the heaviest and the least visited; the match page carries
 * the item and ability data.
 *
 * HomePage stays eager on purpose: it is the entry route, and lazy-loading the first thing
 * a visitor sees would trade one round trip for another with nothing gained.
 */
const MatchPage = lazy(() => import('./pages/MatchPage'))
const TournamentPage = lazy(() => import('./pages/TournamentPage'))
const SeriesPage = lazy(() => import('./pages/SeriesPage'))
const PrematchPage = lazy(() => import('./pages/PrematchPage'))

/**
 * Deliberately quiet: a chunk arrives in well under a second on any real connection, and a
 * spinner that flashes for 200 ms reads as a stutter rather than as progress. The page's own
 * skeletons cover the data fetch that follows.
 */
function RouteFallback() {
  return <div className="min-h-screen bg-bg" aria-busy="true" />
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/" element={<BentoErrorBoundary><HomePage /></BentoErrorBoundary>} />
      <Route path="/match/:matchId" element={<BentoErrorBoundary><MatchPage /></BentoErrorBoundary>} />
      {/* v2.0 archive routes. In a demo build the archive endpoints do not exist, so the
          pages render their empty states rather than 404ing the whole app. */}
      <Route path="/tournament/:leagueId" element={<BentoErrorBoundary><TournamentPage /></BentoErrorBoundary>} />
      {/* A scheduled series has no match id yet, so it is addressed by bracket node. */}
      <Route path="/tournament/:leagueId/node/:nodeId" element={<BentoErrorBoundary><PrematchPage /></BentoErrorBoundary>} />
      <Route path="/series/:seriesId" element={<BentoErrorBoundary><SeriesPage /></BentoErrorBoundary>} />
    </Routes>
    </Suspense>
  )
}
