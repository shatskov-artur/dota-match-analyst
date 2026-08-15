import { describe, it, expect } from 'vitest'
import { seriesWinsBySide } from './seriesWins'

/**
 * TI 2026 series 1130567: Team Spirit (7119388) vs TEAM VISION (9572001), and VISION took
 * game 1 while playing Dire. team1Wins/team2Wins are 0/1 — read positionally that renders
 * as the Radiant side leading, which is the opposite of what happened.
 */
const SERIES = { team1Id: 7119388, team2Id: 9572001, team1Wins: 0, team2Wins: 1 }

describe('seriesWinsBySide', () => {
  it('maps the score onto the side each team actually played', () => {
    // Team Spirit on Radiant: they are team1, so 0-1 stands as written.
    expect(seriesWinsBySide(SERIES, 7119388)).toEqual({ radiant: 0, dire: 1 })
    // Next map the sides swap; the same series score must now read 1-0.
    expect(seriesWinsBySide(SERIES, 9572001)).toEqual({ radiant: 1, dire: 0 })
  })

  it('returns null rather than guessing when the Radiant team is not in the series', () => {
    expect(seriesWinsBySide(SERIES, 2163)).toBeNull()
  })

  it('returns null when there is nothing to map', () => {
    expect(seriesWinsBySide(null, 7119388)).toBeNull()
    expect(seriesWinsBySide(undefined, 7119388)).toBeNull()
    expect(seriesWinsBySide(SERIES, undefined)).toBeNull()
    expect(seriesWinsBySide(SERIES, null)).toBeNull()
  })

  it('returns null when the series score is unpublished', () => {
    expect(seriesWinsBySide({ ...SERIES, team1Wins: null }, 7119388)).toBeNull()
    expect(seriesWinsBySide({ ...SERIES, team2Wins: null }, 7119388)).toBeNull()
  })

  it('keeps a genuine 0-0 rather than treating it as missing', () => {
    // Game 1 in progress: 0-0 is the true score, not an absent one.
    expect(seriesWinsBySide({ ...SERIES, team1Wins: 0, team2Wins: 0 }, 7119388)).toEqual({
      radiant: 0,
      dire: 0,
    })
  })
})
