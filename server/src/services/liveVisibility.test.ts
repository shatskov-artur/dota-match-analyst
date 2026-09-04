import { describe, it, expect } from 'vitest'

// Valve's live feed is mostly ladder traffic — on a measured evening, 17 of 30 games carried
// no team name on either side. Those render as "TBD vs TBD" and push the real tournament
// matches off the first screen. These tests pin down BOTH halves of the rule: the noise goes,
// and a match from a tournament that matters is never dropped on a technicality.

import { isWorthShowing, selectVisibleGames } from './liveVisibility.js'
import type { EnrichedLiveGame } from './liveAggregator.js'

/** The route passes env.isTrackedLeague; the tests pass this stand-in. */
const isTracked = (id: number) => id === 19719

function game(over: Partial<EnrichedLiveGame> = {}): EnrichedLiveGame {
  return {
    match_id: 1,
    league_id: 123,
    league_tier: 'excluded',
    radiant_team: null,
    dire_team: null,
    ...over,
  } as EnrichedLiveGame
}

describe('isWorthShowing', () => {
  it('shows a match when both teams are named', () => {
    expect(
      isWorthShowing(
        game({ radiant_team: { team_name: 'Team Spirit' }, dire_team: { team_name: 'Falcons' } }),
        isTracked,
      ),
    ).toBe(true)
  })

  it('shows a match when only one side is named', () => {
    // Half an identity is still an identity — the viewer can recognise the fixture.
    expect(isWorthShowing(game({ radiant_team: { team_name: 'Team Spirit' } }), isTracked)).toBe(true)
  })

  it('hides a nameless ladder match', () => {
    expect(isWorthShowing(game(), isTracked)).toBe(false)
  })

  it('treats an empty or whitespace name as no name', () => {
    // Valve sends both null and "" for an unregistered side.
    expect(isWorthShowing(game({ radiant_team: { team_name: '' } }), isTracked)).toBe(false)
    expect(isWorthShowing(game({ dire_team: { team_name: '   ' } }), isTracked)).toBe(false)
  })

  it('keeps a nameless premium match', () => {
    // The safety valve: Valve attaches rosters a few seconds after a match enters the feed,
    // so a real tournament game is briefly nameless. Hiding it would make the one match
    // people came for flicker in and out of the list.
    expect(isWorthShowing(game({ league_tier: 'premium' }), isTracked)).toBe(true)
  })

  it('keeps a nameless professional match', () => {
    expect(isWorthShowing(game({ league_tier: 'professional' }), isTracked)).toBe(true)
  })

  it('keeps a nameless match from a tracked league', () => {
    expect(isWorthShowing(game({ league_id: 19719 }), isTracked)).toBe(true)
  })

  it('hides a nameless amateur match even though the tier is known', () => {
    expect(isWorthShowing(game({ league_tier: 'amateur' }), isTracked)).toBe(false)
  })

  it('hides a nameless match whose tier is unknown', () => {
    expect(isWorthShowing(game({ league_tier: null }), isTracked)).toBe(false)
  })
})

describe('selectVisibleGames', () => {
  it('reports how many it withheld', () => {
    const { games, hidden } = selectVisibleGames([
      game({ match_id: 1, radiant_team: { team_name: 'Falcons' } }),
      game({ match_id: 2 }),
      game({ match_id: 3 }),
      game({ match_id: 4, league_tier: 'premium' }),
    ], isTracked)

    expect(games.map((g) => g.match_id)).toEqual([1, 4])
    // The count is what lets the client say the list is short on purpose.
    expect(hidden).toBe(2)
  })

  it('reports nothing hidden when every match is nameable', () => {
    const { games, hidden } = selectVisibleGames([
      game({ match_id: 1, radiant_team: { team_name: 'Falcons' } }),
      game({ match_id: 2, dire_team: { team_name: 'Spirit' } }),
    ], isTracked)
    expect(games).toHaveLength(2)
    expect(hidden).toBe(0)
  })

  it('survives an empty feed', () => {
    expect(selectVisibleGames([], isTracked)).toEqual({ games: [], hidden: 0 })
  })
})
