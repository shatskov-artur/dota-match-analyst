import { Routes, Route } from 'react-router'
import HomePage from './pages/HomePage'
import MatchPlaceholder from './pages/MatchPlaceholder'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/match/:matchId" element={<MatchPlaceholder />} />
    </Routes>
  )
}
