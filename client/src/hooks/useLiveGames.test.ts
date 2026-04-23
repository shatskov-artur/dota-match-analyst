import { describe, it, expect } from 'vitest'
import { groupByLeague } from '../hooks/useLiveGames'

interface EnrichedGame {
  match_id: number
  league_id: number
  league_name: string
  game_state?: number
}

describe('groupByLeague', () => {
  it('returns empty array for empty input', () => {
    expect(groupByLeague([])).toEqual([])
  })

  it('groups a single game into one league bucket', () => {
    const games: EnrichedGame[] = [
      { match_id: 1, league_id: 100, league_name: 'ESL Pro League', game_state: 5 },
    ]
    const result = groupByLeague(games)
    expect(result).toHaveLength(1)
    expect(result[0].leagueName).toBe('ESL Pro League')
    expect(result[0].matches).toHaveLength(1)
    expect(result[0].matches[0].match_id).toBe(1)
  })

  it('groups two games with the same league_id into one bucket', () => {
    const games: EnrichedGame[] = [
      { match_id: 1, league_id: 100, league_name: 'ESL Pro League', game_state: 5 },
      { match_id: 2, league_id: 100, league_name: 'ESL Pro League', game_state: 2 },
    ]
    const result = groupByLeague(games)
    expect(result).toHaveLength(1)
    expect(result[0].matches).toHaveLength(2)
  })

  it('groups games from two different leagues into two buckets', () => {
    const games: EnrichedGame[] = [
      { match_id: 1, league_id: 100, league_name: 'ESL Pro League', game_state: 5 },
      { match_id: 2, league_id: 200, league_name: 'The International 2025', game_state: 5 },
    ]
    const result = groupByLeague(games)
    expect(result).toHaveLength(2)
    expect(result[0].leagueName).toBe('ESL Pro League')
    expect(result[1].leagueName).toBe('The International 2025')
  })

  it('preserves insertion order — first-seen league appears first', () => {
    const games: EnrichedGame[] = [
      { match_id: 3, league_id: 300, league_name: 'League #300', game_state: 6 },
      { match_id: 1, league_id: 100, league_name: 'ESL Pro League', game_state: 5 },
      { match_id: 2, league_id: 300, league_name: 'League #300', game_state: 6 },
    ]
    const result = groupByLeague(games)
    expect(result[0].leagueName).toBe('League #300')
    expect(result[1].leagueName).toBe('ESL Pro League')
  })
})
