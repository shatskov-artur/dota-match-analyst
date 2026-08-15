import MatchCard from './MatchCard'
import type { EnrichedGame } from '../hooks/useLiveGames'

interface MatchBentoGridProps {
  /** Already filtered + sorted by the caller (HomePage via applyFilters). */
  matches: EnrichedGame[]
  /** Leagues being recorded — they win the featured tile. */
  trackedLeagueIds?: readonly number[]
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
/**
 * The 2x2 tile is four times the size of the others, so it has to be worth the space.
 * Taking matches[0] blindly gave it whichever match the active sort happened to put
 * first — regularly a game at 0:00 with both teams still "TBD", rendering an enormous
 * mostly-empty card above real ones.
 *
 * Prefer a match that actually has something to show: in progress, named teams, and the
 * furthest along. Falls back to the first match when nothing qualifies, so a list of
 * fresh games still gets a featured tile.
 */
export function pickFeatured(matches: EnrichedGame[], trackedLeagueIds: readonly number[] = []): EnrichedGame {
  const tracked = new Set(trackedLeagueIds)
  const score = (g: EnrichedGame): number => {
    const named = !!(g.radiant_team?.team_name && g.dire_team?.team_name)
    const inGame = g.game_state === 5
    const minutes = Math.min((g.duration ?? 0) / 60, 90)
    // A tracked league outranks every other signal. The tile is the biggest thing on the
    // page and it was going to whichever amateur game had been running longest.
    const isTracked = g.league_id !== undefined && tracked.has(g.league_id)
    return (isTracked ? 100_000 : 0) + (inGame ? 1000 : 0) + (named ? 500 : 0) + minutes
  }
  return matches.reduce((best, g) => (score(g) > score(best) ? g : best), matches[0])
}

export default function MatchBentoGrid({ matches, trackedLeagueIds = [] }: MatchBentoGridProps) {
  if (matches.length === 0) return null

  const featured = pickFeatured(matches, trackedLeagueIds)
  // Everything else keeps the caller's ordering.
  const rest = matches.filter((m) => m !== featured)

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
