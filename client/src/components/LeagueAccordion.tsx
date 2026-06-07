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
        className="w-full flex items-center justify-between px-4 md:px-8 py-4 min-h-[44px] cursor-pointer group bg-transparent"
      >
        {/* Left: section label */}
        <span className="flex items-center gap-4">
          <span className="text-text text-[10px] uppercase tracking-[0.3em] font-bold">
            Tournament
          </span>
          <span className="h-px flex-1 w-12 bg-border" />
          <span className="text-text-muted text-sm font-semibold tracking-tight transition-colors duration-150 group-hover:text-text">
            {leagueName}
          </span>
        </span>

        {/* Right: match count + toggle */}
        <span className="flex items-center gap-4">
          <span className="text-text-dim text-[10px] tabular-nums">
            {matches.length} {matches.length === 1 ? 'match' : 'matches'}
          </span>
          <span
            className="text-text-dim text-[10px] block"
            style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 200ms ease' }}
          >
            ▾
          </span>
        </span>
      </button>

      {/* Thin separator */}
      <div className="h-px bg-border mx-8" />

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
