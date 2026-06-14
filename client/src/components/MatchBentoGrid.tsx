import MatchCard from './MatchCard'
import type { EnrichedGame } from '../hooks/useLiveGames'

interface MatchBentoGridProps {
  /** Already filtered + sorted by the caller (HomePage via applyFilters). */
  matches: EnrichedGame[]
}

/**
 * Neon Bento home grid (replaces LeagueAccordion). Renders a pre-sorted match
 * list as a bento grid; the first match becomes the featured 2x2 tile. League
 * identity is carried on each card's label, so grouping reads visually without
 * a collapsing accordion.
 *
 * Grid: 1 col (phone) -> 2 col (tablet) -> 3 col (laptop+), with grid-auto-rows so
 * the featured 2x2 tile lines up cleanly (ui-ux-pro-max Bento Box Grid pattern).
 */
export default function MatchBentoGrid({ matches }: MatchBentoGridProps) {
  if (matches.length === 0) return null

  const [featured, ...rest] = matches

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-6
                 sm:[grid-auto-rows:minmax(150px,auto)] lg:[grid-auto-rows:minmax(160px,auto)]"
    >
      {/* Featured tile: full-width on phone, 2 cols on tablet, 2x2 on laptop+ */}
      <div className="flex sm:col-span-2 lg:col-span-2 lg:row-span-2">
        <MatchCard game={featured} featured />
      </div>
      {rest.map(game => (
        <MatchCard key={game.match_id} game={game} />
      ))}
    </div>
  )
}
