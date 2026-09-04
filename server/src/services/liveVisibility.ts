import type { EnrichedLiveGame } from './liveAggregator.js'

/**
 * Which live matches are worth putting in front of a viewer.
 *
 * Valve's live feed is mostly ladder traffic. On a typical evening 17 of 30 games carry no
 * team name on either side — FACEIT queues and open cups, where the client can only render
 * "TBD vs TBD". A match nobody can name is not a match anybody can choose, so it is noise
 * that pushes the handful of real tournament games off the first screen.
 *
 * This filters the RESPONSE only. `enrichLiveGames` still returns everything, so the ingest
 * job keeps archiving and the Redis gold/XP timeseries keeps accumulating for every game —
 * hiding a row from the list must never mean losing its recording.
 */

/** A usable, non-empty team name, or null. Valve sends both `null` and `""`. */
function teamName(team: unknown): string | null {
  if (!team || typeof team !== 'object') return null
  const name = (team as { team_name?: unknown }).team_name
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

/**
 * A match is shown when a viewer could name at least one side of it, OR when it belongs to
 * a tournament we already decided matters.
 *
 * The second half is the safety valve and the reason this is not a bare name check: Valve
 * attaches team rosters to a match some seconds after it appears in the feed, so a genuine
 * premium game is briefly nameless. Hiding it for those seconds would make the one match
 * people opened the page for flicker in and out. Tier and tracking are known immediately,
 * so a tournament that matters is never filtered on a technicality.
 */
export function isWorthShowing(
  game: EnrichedLiveGame,
  isTracked: (leagueId: number) => boolean,
): boolean {
  if (teamName(game.radiant_team) || teamName(game.dire_team)) return true

  const tier = typeof game.league_tier === 'string' ? game.league_tier : null
  if (tier === 'premium' || tier === 'professional') return true

  return typeof game.league_id === 'number' && isTracked(game.league_id)
}

export interface VisibleGames {
  games: EnrichedLiveGame[]
  /** How many were withheld — the client says so rather than silently showing a short list. */
  hidden: number
}

export function selectVisibleGames(
  enriched: EnrichedLiveGame[],
  isTracked: (leagueId: number) => boolean,
): VisibleGames {
  const games = enriched.filter((g) => isWorthShowing(g, isTracked))
  return { games, hidden: enriched.length - games.length }
}
