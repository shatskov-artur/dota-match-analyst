import { Routes, Route } from 'react-router'
import HomePage from './pages/HomePage'
import MatchPage from './pages/MatchPage'
import { BentoErrorBoundary } from './components/BentoErrorBoundary'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<BentoErrorBoundary><HomePage /></BentoErrorBoundary>} />
      <Route path="/match/:matchId" element={<BentoErrorBoundary><MatchPage /></BentoErrorBoundary>} />
    </Routes>
  )
}
