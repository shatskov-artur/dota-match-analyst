import { describe, it, expect } from 'vitest'
import { findLiveGameForSeries, shouldArmSeriesFollow } from './liveSeries'
import type { EnrichedGame } from '../hooks/useLiveGames'

/**
 * The real shape of the problem, from TI 2026: node 48 is under way, GetLiveLeagueGames
 * carries the match, and the archive's series row still has `matchIds: []`. Resolving the
 * pair against the feed is what stops that click landing on the home page.
 */
const game = (over: Partial<EnrichedGame> & { match_id: number }): EnrichedGame => ({
  league_id: 19719,
  league_name: 'The International 2026',
  ...over,
})

const SERIES = {
  seriesId: 1130567,
  leagueId: 19719,
  nodeId: 48,
  team1Id: 7119388,
  team2Id: 9572001,
  team1Name: 'Team Spirit',
  team2Name: 'TEAM VISION',
}

describe('findLiveGameForSeries', () => {
  it('finds the game whichever side the teams drew', () => {
    const asDrawn = game({
      match_id: 8946351114,
      radiant_team: { team_name: 'Team Spirit', team_id: 7119388 },
      dire_team: { team_name: 'TEAM VISION', team_id: 9572001 },
    })
    expect(findLiveGameForSeries([asDrawn], SERIES)).toBe(8946351114)

    // Sides are decided per map, so the same series can appear mirrored on the next one.
    const mirrored = game({
      match_id: 8946351115,
      radiant_team: { team_id: 9572001 },
      dire_team: { team_id: 7119388 },
    })
    expect(findLiveGameForSeries([mirrored], SERIES)).toBe(8946351115)
  })

  it('ignores the same fixture in another league', () => {
    const elsewhere = game({
      match_id: 999,
      league_id: 19479,
      radiant_team: { team_id: 7119388 },
      dire_team: { team_id: 9572001 },
    })
    expect(findLiveGameForSeries([elsewhere], SERIES)).toBeNull()
  })

  it('ignores a game that shares only one team', () => {
    const halfMatch = game({
      match_id: 998,
      radiant_team: { team_id: 7119388 },
      dire_team: { team_id: 2163 },
    })
    expect(findLiveGameForSeries([halfMatch], SERIES)).toBeNull()
  })

  it('skips games whose teams Valve has not published', () => {
    // Amateur leagues stream games with no team block at all; those must never match.
    const anonymous = game({ match_id: 997 })
    expect(findLiveGameForSeries([anonymous, game({ match_id: 996, radiant_team: {}, dire_team: {} })], SERIES)).toBeNull()
  })

  it('matches nothing for a series whose own teams are undecided', () => {
    const anyGame = game({
      match_id: 995,
      radiant_team: { team_id: 7119388 },
      dire_team: { team_id: 9572001 },
    })
    expect(findLiveGameForSeries([anyGame], { ...SERIES, team1Id: null, team2Id: null })).toBeNull()
  })
})

describe('shouldArmSeriesFollow', () => {
  const GAME1 = '8946351114'
  const GAME2 = 8946428867

  it('arms while watching the map that is live — the next one may start any minute', () => {
    expect(shouldArmSeriesFollow(8946351114, GAME1)).toBe(true)
  })

  it('arms between maps, when the series has nothing live at all', () => {
    // Game 1 has ended and game 2 has not been drawn yet. This is the case the whole
    // feature exists for: the draft begins minutes later and must not be missed.
    expect(shouldArmSeriesFollow(null, GAME1)).toBe(true)
  })

  it('stays disarmed when a different map is already live as the page opens', () => {
    // Opening game 1 from the tabs while game 2 runs is a deliberate choice. Following
    // here would bounce the reader straight back out and make finished maps unreadable.
    expect(shouldArmSeriesFollow(GAME2, GAME1)).toBe(false)
  })

  it('arms when there is no match on screen to compare against', () => {
    expect(shouldArmSeriesFollow(null, undefined)).toBe(true)
  })
})
