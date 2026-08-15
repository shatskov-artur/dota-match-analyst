import { describe, it, expect } from 'vitest'
import { resolveSeriesScore, tallyFromGames, toSeriesResults } from './seriesScore.js'

const SPIRIT = 7119388
const NIGMA = 9247354

describe('tallyFromGames', () => {
  it('resolves the winner through each map own team ids, not through the side', () => {
    // The sides swap between maps, which is exactly why radiant_win cannot be read as a
    // team result: Nigma is Radiant in game 1 and Dire in game 2, and wins both.
    const tally = tallyFromGames([
      { seriesId: 1, radiantTeamId: NIGMA, direTeamId: SPIRIT, radiantWin: true },
      { seriesId: 1, radiantTeamId: SPIRIT, direTeamId: NIGMA, radiantWin: false },
    ])
    expect(tally.get(1)?.get(NIGMA)).toBe(2)
    expect(tally.get(1)?.get(SPIRIT)).toBeUndefined()
  })

  it('ignores maps that have not been decided or have no series', () => {
    const tally = tallyFromGames([
      { seriesId: 1, radiantTeamId: NIGMA, direTeamId: SPIRIT, radiantWin: null },
      { seriesId: null, radiantTeamId: NIGMA, direTeamId: SPIRIT, radiantWin: true },
    ])
    expect(tally.size).toBe(0)
  })
})

describe('resolveSeriesScore', () => {
  const series = { seriesId: 1, team1Id: NIGMA, team2Id: SPIRIT, bestOf: 3 }

  /** The reported case: three views of one series, three different answers. */
  it('overrides a stale published score with the maps actually played', () => {
    const tally = tallyFromGames([
      { seriesId: 1, radiantTeamId: NIGMA, direTeamId: SPIRIT, radiantWin: true },
      { seriesId: 1, radiantTeamId: SPIRIT, direTeamId: NIGMA, radiantWin: false },
    ])
    // Valve's bracket still said 1-0 and left the series marked as running.
    const out = resolveSeriesScore({ ...series, team1Wins: 1, team2Wins: 0 }, tally)
    expect(out).toEqual({ team1Wins: 2, team2Wins: 0, decided: true })
  })

  it('keeps the published score when it is the one further ahead', () => {
    // A map nobody recorded leaves no row of ours, so Valve can lead — both sources
    // under-report, neither over-reports, and the higher number is the true one.
    const out = resolveSeriesScore({ ...series, team1Wins: 2, team2Wins: 1 }, new Map())
    expect(out).toEqual({ team1Wins: 2, team2Wins: 1, decided: true })
  })

  it('merges per team rather than picking a winning source', () => {
    const tally = tallyFromGames([
      { seriesId: 1, radiantTeamId: SPIRIT, direTeamId: NIGMA, radiantWin: true },
    ])
    // Valve has team 1 at 1, we have team 2 at 1 — the series is 1-1, not 1-0 or 0-1.
    expect(resolveSeriesScore({ ...series, team1Wins: 1, team2Wins: 0 }, tally)).toEqual({
      team1Wins: 1,
      team2Wins: 1,
      decided: false,
    })
  })

  it('reports no score at all when nothing is known', () => {
    // 0-0 would claim the series was played to a draw.
    expect(resolveSeriesScore({ ...series, team1Wins: null, team2Wins: null }, new Map())).toEqual({
      team1Wins: null,
      team2Wins: null,
      decided: false,
    })
  })

  it('needs a known format before calling a series decided', () => {
    const tally = tallyFromGames([
      { seriesId: 1, radiantTeamId: NIGMA, direTeamId: SPIRIT, radiantWin: true },
    ])
    // One map won decides a Bo1 and decides nothing in a Bo3; with no bestOf published,
    // closing the series would end a live game on screen.
    expect(resolveSeriesScore({ ...series, bestOf: 1, team1Wins: null, team2Wins: null }, tally).decided).toBe(true)
    expect(resolveSeriesScore({ ...series, bestOf: 3, team1Wins: null, team2Wins: null }, tally).decided).toBe(false)
    expect(resolveSeriesScore({ ...series, bestOf: null, team1Wins: null, team2Wins: null }, tally).decided).toBe(false)
    expect(resolveSeriesScore({ ...series, bestOf: 5, team1Wins: 2, team2Wins: 1 }, tally).decided).toBe(false)
  })

  it('ignores a tally for teams that are not in this series', () => {
    const tally = tallyFromGames([
      { seriesId: 1, radiantTeamId: 111, direTeamId: 222, radiantWin: true },
    ])
    expect(resolveSeriesScore({ ...series, team1Wins: 1, team2Wins: 0 }, tally)).toEqual({
      team1Wins: 1,
      team2Wins: 0,
      decided: false,
    })
  })
})

describe('toSeriesResults', () => {
  it('flattens the tally for the client', () => {
    const tally = tallyFromGames([
      { seriesId: 4, radiantTeamId: NIGMA, direTeamId: SPIRIT, radiantWin: true },
    ])
    expect(toSeriesResults(tally)).toEqual([{ seriesId: 4, wins: [{ teamId: NIGMA, wins: 1 }] }])
  })
})
