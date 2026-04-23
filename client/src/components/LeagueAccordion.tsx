import { useState } from 'react'
import MatchRow from './MatchRow'
import type { EnrichedGame } from '../hooks/useLiveGames'

interface LeagueAccordionProps {
  leagueName: string
  matches: EnrichedGame[]
}

export default function LeagueAccordion({ leagueName, matches }: LeagueAccordionProps) {
  // D-07: all sections expanded by default
  const [isOpen, setIsOpen] = useState(true)

  return (
    <div className="mb-4">
      {/* Accordion header — keyboard-accessible button per UI-SPEC accessibility notes */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-2 bg-gray-900 cursor-pointer"
        aria-expanded={isOpen}
      >
        <span className="text-white text-xl font-bold">{leagueName}</span>
        {/* Plain Unicode chevrons — no icon library installed */}
        <span className="text-gray-400">{isOpen ? '▾' : '▸'}</span>
      </button>

      {isOpen && (
        <div>
          {matches.map((game) => (
            <MatchRow key={game.match_id} game={game} />
          ))}
        </div>
      )}
    </div>
  )
}
