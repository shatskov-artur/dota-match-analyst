import { Routes, Route } from 'react-router'
import HomePage from './pages/HomePage'
import MatchPage from './pages/MatchPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/match/:matchId" element={<MatchPage />} />
    </Routes>
  )
}
