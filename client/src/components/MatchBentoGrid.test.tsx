import { describe, it, expect } from 'vitest'
import { pickFeatured } from './MatchBentoGrid'
import type { EnrichedGame } from '../hooks/useLiveGames'

const game = (over: Partial<EnrichedGame>): EnrichedGame =>
  ({
    match_id: 1,
    league_id: 1,
    league_name: 'League',
    game_state: 5,
    duration: 600,
    radiant_team: { team_name: 'Radiant FC' },
    dire_team: { team_name: 'Dire FC' },
    ...over,
  }) as EnrichedGame

describe('pickFeatured', () => {
  it('skips a just-started match with unknown teams in favour of a real one', () => {
    // The failure this guards: the featured tile is 4× the size of the others, and the
    // sort regularly put a 0:00 TBD-vs-TBD game first.
    const fresh = game({ match_id: 1, duration: 0, radiant_team: {}, dire_team: {} })
    const real = game({ match_id: 2, duration: 1800 })
    expect(pickFeatured([fresh, real]).match_id).toBe(2)
  })

  it('prefers an in-game match over one still drafting', () => {
    const draft = game({ match_id: 1, game_state: 2, duration: 0 })
    const inGame = game({ match_id: 2, game_state: 5, duration: 120 })
    expect(pickFeatured([draft, inGame]).match_id).toBe(2)
  })

  it('prefers named teams when both are in progress', () => {
    const unnamed = game({ match_id: 1, duration: 900, radiant_team: {}, dire_team: {} })
    const named = game({ match_id: 2, duration: 300 })
    expect(pickFeatured([unnamed, named]).match_id).toBe(2)
  })

  it('breaks a tie by how far along the match is', () => {
    const early = game({ match_id: 1, duration: 300 })
    const late = game({ match_id: 2, duration: 2400 })
    expect(pickFeatured([early, late]).match_id).toBe(2)
  })

  it('does not let one very long match outrank being in-game at all', () => {
    const finishedMarathon = game({ match_id: 1, game_state: 6, duration: 6000 })
    const liveShort = game({ match_id: 2, game_state: 5, duration: 60 })
    expect(pickFeatured([finishedMarathon, liveShort]).match_id).toBe(2)
  })

  it('still returns something when every match is empty', () => {
    const a = game({ match_id: 1, duration: 0, game_state: 2, radiant_team: {}, dire_team: {} })
    const b = game({ match_id: 2, duration: 0, game_state: 2, radiant_team: {}, dire_team: {} })
    expect([1, 2]).toContain(pickFeatured([a, b]).match_id)
  })
})

describe('pickFeatured — tracked leagues', () => {
  it('gives the big tile to the recorded tournament', () => {
    // Without this the tile went to whichever amateur game had run longest, and on a busy
    // evening The International was not on screen at all.
    const amateur = game({ match_id: 1, league_id: 999, game_state: 5, duration: 5400 })
    const ti = game({ match_id: 2, league_id: 19719, game_state: 5, duration: 120 })
    expect(pickFeatured([amateur, ti], [19719]).match_id).toBe(2)
  })

  it('falls back to the old heuristic among tracked matches', () => {
    const short = game({ match_id: 1, league_id: 19719, game_state: 5, duration: 120 })
    const long = game({ match_id: 2, league_id: 19719, game_state: 5, duration: 3000 })
    expect(pickFeatured([short, long], [19719]).match_id).toBe(2)
  })

  it('is unchanged when no league is tracked', () => {
    const a = game({ match_id: 1, league_id: 999, game_state: 5, duration: 5400 })
    const b = game({ match_id: 2, league_id: 19719, game_state: 5, duration: 120 })
    expect(pickFeatured([a, b]).match_id).toBe(pickFeatured([a, b], []).match_id)
  })
})
