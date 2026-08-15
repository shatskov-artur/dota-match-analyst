import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { matches } from '../../db/schema.js'

/**
 * One answer to "what is the score of this series", for every route that shows one.
 *
 * Three tables carry a copy of it and they drift apart constantly:
 *
 *   bracket_nodes.team_N_wins  Valve's bracket. Updated when Valve feels like it — it sat
 *                              at 1-0 for a series the archive had already recorded as
 *                              2-0, so the schedule called a finished series "live".
 *   series.team_N_wins         Valve again, by a different sync path, and therefore at a
 *                              different moment. The match page read this one and showed
 *                              2-0 while the schedule beside it showed 1-0.
 *   matches.radiant_win        What actually happened, one row per map, written the moment
 *                              OpenDota reports a winner. This is the ground truth.
 *
 * So: count the maps ourselves, and keep whichever of the two counts is further ahead per
 * team. Both sources can only ever UNDER-report — Valve because it lags, ours because a
 * map nobody recorded leaves no row — so the higher number is the true one, and a score
 * can lag but never regress.
 *
 * radiant_win describes the SIDE, not the team, and a series routinely swaps sides between
 * maps. The winner is resolved through each map's own team ids or not at all.
 */

type Db = NonNullable<typeof db>

/** seriesId → teamId → maps won. */
export type SeriesWinTally = Map<number, Map<number, number>>

export interface DecidedMap {
  seriesId: number | null
  radiantTeamId: number | null
  direTeamId: number | null
  radiantWin: boolean | null
}

/** Counts finished maps per team, for series that already have their rows in hand. */
export function tallyFromGames(games: readonly DecidedMap[]): SeriesWinTally {
  const bySeries: SeriesWinTally = new Map()
  for (const m of games) {
    if (m.seriesId === null || m.radiantWin === null) continue
    const winner = m.radiantWin ? m.radiantTeamId : m.direTeamId
    if (!winner) continue
    const tally = bySeries.get(m.seriesId) ?? new Map<number, number>()
    tally.set(winner, (tally.get(winner) ?? 0) + 1)
    bySeries.set(m.seriesId, tally)
  }
  return bySeries
}

/**
 * The same count, read from the archive.
 *
 * By league for a tournament page, by series id for a window that spans many of them.
 * An empty `seriesIds` skips the query rather than asking for nothing.
 */
export async function tallySeriesWins(
  d: Db,
  filter: { leagueId?: number; seriesIds?: readonly number[] },
): Promise<SeriesWinTally> {
  const ids = filter.seriesIds
  if (ids !== undefined && ids.length === 0) return new Map()

  const rows = await d
    .select({
      seriesId: matches.seriesId,
      radiantTeamId: matches.radiantTeamId,
      direTeamId: matches.direTeamId,
      radiantWin: matches.radiantWin,
    })
    .from(matches)
    .where(
      and(
        isNotNull(matches.seriesId),
        isNotNull(matches.radiantWin),
        filter.leagueId !== undefined ? eq(matches.leagueId, filter.leagueId) : undefined,
        ids !== undefined ? inArray(matches.seriesId, [...ids]) : undefined,
      ),
    )

  return tallyFromGames(rows)
}

export interface SeriesScoreInput {
  seriesId: number | null
  team1Id: number | null
  team2Id: number | null
  /** The published score. Null where nothing has been published at all. */
  team1Wins: number | null
  team2Wins: number | null
  bestOf: number | null
}

export interface ResolvedSeriesScore {
  team1Wins: number | null
  team2Wins: number | null
  /**
   * Someone has taken enough maps to win the series. Only ever true with a known bestOf —
   * calling a 1-0 decided because the format was unknown would close a live Bo3.
   */
  decided: boolean
}

export function resolveSeriesScore(
  input: SeriesScoreInput,
  tally: SeriesWinTally,
): ResolvedSeriesScore {
  const ours = input.seriesId !== null ? tally.get(input.seriesId) : undefined
  const own1 = input.team1Id !== null ? (ours?.get(input.team1Id) ?? 0) : 0
  const own2 = input.team2Id !== null ? (ours?.get(input.team2Id) ?? 0) : 0

  const team1 = Math.max(input.team1Wins ?? 0, own1)
  const team2 = Math.max(input.team2Wins ?? 0, own2)
  // A series nobody has published and nobody has played has no score — 0-0 would be a
  // claim that it was played to a draw.
  const known = input.team1Wins !== null || input.team2Wins !== null || ours !== undefined

  const needed = input.bestOf ? Math.floor(input.bestOf / 2) + 1 : null

  return {
    team1Wins: known ? team1 : null,
    team2Wins: known ? team2 : null,
    decided: needed !== null && (team1 >= needed || team2 >= needed),
  }
}

/** Flattened for the client, which merges it into Valve's node score the same way. */
export function toSeriesResults(
  tally: SeriesWinTally,
): Array<{ seriesId: number; wins: Array<{ teamId: number; wins: number }> }> {
  return [...tally.entries()].map(([seriesId, wins]) => ({
    seriesId,
    wins: [...wins.entries()].map(([teamId, w]) => ({ teamId, wins: w })),
  }))
}
