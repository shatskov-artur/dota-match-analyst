import type { EnrichedGame } from '../hooks/useLiveGames'

/**
 * The game of a series that is being played right now, according to Valve's live feed.
 *
 * The archive cannot answer this on its own. Valve publishes a series before it publishes
 * the match id of the map currently being played, so `series.matchIds` trails by minutes —
 * long enough to miss a whole draft. The feed is the definition of what is live; the
 * archive is a cache of it.
 *
 * Matched on the pair of team ids rather than on names, and constrained to the series' own
 * league so two tournaments running the same fixture cannot cross over. Sides are compared
 * unordered because who is Radiant is drawn per map, not per series — game 2 routinely
 * mirrors game 1.
 */

/** Only the fields the match actually needs, so any series-shaped payload can be passed. */
export interface SeriesTeams {
  leagueId?: number | null
  team1Id: number | null
  team2Id: number | null
}

/**
 * Whether a match page may follow its series into the next map.
 *
 * Decided once, from the state the page opened in, and it is the difference between a
 * feature and a trap. Following has to mean "the next map started while you were here".
 * If a different map of the series was ALREADY live when the page opened, the reader
 * asked for this one on purpose — from the series tabs, a bookmark, a shared link — and
 * bouncing them out of it would make finished maps unreadable for as long as the series
 * runs.
 */
export function shouldArmSeriesFollow(liveInSeries: number | null, matchId: string | undefined): boolean {
  if (liveInSeries === null) return true
  return String(liveInSeries) === matchId
}

export function findLiveGameForSeries(
  games: EnrichedGame[],
  series: SeriesTeams | null | undefined,
): number | null {
  if (!series) return null
  const { team1Id, team2Id, leagueId } = series
  if (!team1Id || !team2Id) return null
  for (const g of games) {
    if (leagueId && g.league_id !== leagueId) continue
    const radiant = g.radiant_team?.team_id
    const dire = g.dire_team?.team_id
    if (!radiant || !dire) continue
    if ((radiant === team1Id && dire === team2Id) || (radiant === team2Id && dire === team1Id)) {
      return g.match_id
    }
  }
  return null
}
