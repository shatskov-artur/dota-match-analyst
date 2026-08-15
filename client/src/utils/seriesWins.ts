/**
 * Series score resolved to sides.
 *
 * A series records team1/team2 in its own order, which says nothing about who is Radiant —
 * that is drawn per map, and the same series routinely swaps. Reading team1Wins as "the
 * Radiant score" is the same class of mistake as reading OpenDota's radiant_win as a team
 * result, so the mapping goes through team ids or does not happen at all.
 *
 * Returns null when the answer is not knowable — no series, no score published, or a
 * Radiant team that is neither side of the series. A wrong score is worse than none.
 */

export interface SeriesSideWins {
  radiant: number
  dire: number
}

export interface SeriesScoreSource {
  team1Id: number | null
  team2Id: number | null
  team1Wins: number | null
  team2Wins: number | null
}

export function seriesWinsBySide(
  series: SeriesScoreSource | null | undefined,
  radiantTeamId: number | null | undefined,
): SeriesSideWins | null {
  if (!series || !radiantTeamId) return null
  const { team1Id, team2Id, team1Wins, team2Wins } = series
  if (team1Wins === null || team2Wins === null) return null
  if (radiantTeamId === team1Id) return { radiant: team1Wins, dire: team2Wins }
  if (radiantTeamId === team2Id) return { radiant: team2Wins, dire: team1Wins }
  return null
}
