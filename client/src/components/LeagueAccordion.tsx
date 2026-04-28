import { useState } from 'react'
import MatchRow from './MatchRow'
import type { EnrichedGame } from '../hooks/useLiveGames'
import { getStatusLabel } from '../utils/gameState'

const STATUS_ORDER: Record<string, number> = {
  'Live': 0, 'Starting': 1, 'Strategy': 2, 'Draft': 3,
  'Waiting': 4, 'Break': 5, 'Post-game': 6, 'Unknown': 7,
}

interface LeagueAccordionProps {
  leagueName: string
  matches: EnrichedGame[]
}

export default function LeagueAccordion({ leagueName, matches }: LeagueAccordionProps) {
  const [isOpen, setIsOpen] = useState(true)

  const sorted = [...matches].sort((a, b) => {
    const ao = STATUS_ORDER[getStatusLabel(a.game_state, a.scoreboard)] ?? 3
    const bo = STATUS_ORDER[getStatusLabel(b.game_state, b.scoreboard)] ?? 3
    return ao - bo
  })

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between px-8 py-4 cursor-pointer group"
        style={{ background: 'transparent' }}
      >
        {/* Left: section label */}
        <span className="flex items-center gap-4">
          <span
            className="text-[10px] uppercase tracking-[0.3em] font-bold"
            style={{ color: '#ffffff' }}
          >
            Tournament
          </span>
          <span
            className="h-px flex-1 w-12"
            style={{ background: '#1e1e1e' }}
          />
          <span
            className="text-sm font-semibold tracking-tight"
            style={{ color: '#b8b8b8', transition: 'color 160ms ease' }}
          >
            {leagueName}
          </span>
        </span>

        {/* Right: match count + toggle */}
        <span className="flex items-center gap-4">
          <span
            className="text-[10px] tabular-nums"
            style={{ color: '#303030' }}
          >
            {matches.length} {matches.length === 1 ? 'match' : 'matches'}
          </span>
          <span
            className="text-[#282828] text-[10px]"
            style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 200ms ease', display: 'block' }}
          >
            ▾
          </span>
        </span>
      </button>

      {/* Thin separator */}
      <div style={{ height: 1, background: '#141414', margin: '0 2rem' }} />

      {isOpen && (
        <div className="relative">
          {sorted.map(game => (
            <MatchRow key={game.match_id} game={game} />
          ))}
        </div>
      )}

      {/* Bottom spacer */}
      <div style={{ height: 24 }} />
    </div>
  )
}
