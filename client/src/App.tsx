import { Routes, Route } from 'react-router'
import HomePage from './pages/HomePage'
import MatchPage from './pages/MatchPage'
import TournamentPage from './pages/TournamentPage'
import SeriesPage from './pages/SeriesPage'
import PrematchPage from './pages/PrematchPage'
import { BentoErrorBoundary } from './components/BentoErrorBoundary'

export default function App() {
  return (
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
  )
}
