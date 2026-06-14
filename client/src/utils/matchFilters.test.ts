import { describe, it, expect } from 'vitest'
import { applyFilters, leagueOptions, DEFAULT_FILTERS } from './matchFilters'
import type { EnrichedGame } from '../hooks/useLiveGames'

// Minimal game factory — only the fields the filters read.
function game(p: Partial<EnrichedGame> & { match_id: number }): EnrichedGame {
  return {
    league_id: 1,
    league_name: 'TI 2026',
    radiant_team: { team_name: 'Team Spirit' },
    dire_team: { team_name: 'Gaimin Gladiators' },
    ...p,
  } as EnrichedGame
}

// game_state 5 = Live, 2 = Draft, 6 = Post-game (per gameState.ts)
const live = game({ match_id: 1, game_state: 5, duration: 1900 })
const draft = game({ match_id: 2, game_state: 2, league_id: 2, league_name: 'DreamLeague',
  radiant_team: { team_name: 'Falcons' }, dire_team: { team_name: 'Team Liquid' } })
const finished = game({ match_id: 3, game_state: 6, duration: 2400,
  radiant_team: { team_name: 'OG' }, dire_team: { team_name: 'Tundra' } })

const all = [draft, finished, live]

describe('applyFilters', () => {
  it('status=all returns everything', () => {
    expect(applyFilters(all, DEFAULT_FILTERS)).toHaveLength(3)
  })

  it('status=live keeps only live matches', () => {
    const r = applyFilters(all, { ...DEFAULT_FILTERS, status: 'live' })
    expect(r.map(g => g.match_id)).toEqual([1])
  })

  it('status=draft keeps only draft matches', () => {
    const r = applyFilters(all, { ...DEFAULT_FILTERS, status: 'draft' })
    expect(r.map(g => g.match_id)).toEqual([2])
  })

  it('status=finished keeps only post-game matches', () => {
    const r = applyFilters(all, { ...DEFAULT_FILTERS, status: 'finished' })
    expect(r.map(g => g.match_id)).toEqual([3])
  })

  it('league filter keeps only the chosen league', () => {
    const r = applyFilters(all, { ...DEFAULT_FILTERS, leagueId: 2 })
    expect(r.map(g => g.match_id)).toEqual([2])
  })

  it('team search matches radiant or dire name, case-insensitive', () => {
    expect(applyFilters(all, { ...DEFAULT_FILTERS, search: 'spirit' }).map(g => g.match_id)).toEqual([1])
    expect(applyFilters(all, { ...DEFAULT_FILTERS, search: 'tundra' }).map(g => g.match_id)).toEqual([3])
    expect(applyFilters(all, { ...DEFAULT_FILTERS, search: 'zzz' })).toHaveLength(0)
  })

  it('liveFirst sort puts live before draft before finished', () => {
    const r = applyFilters(all, { ...DEFAULT_FILTERS, sort: 'liveFirst' })
    expect(r.map(g => g.match_id)).toEqual([1, 2, 3]) // live, draft, post-game
  })

  it('duration sort orders by descending duration', () => {
    const r = applyFilters(all, { ...DEFAULT_FILTERS, sort: 'duration' })
    // finished 2400, live 1900, draft (no duration → 0)
    expect(r.map(g => g.match_id)).toEqual([3, 1, 2])
  })

  it('combines filters: live + search', () => {
    const r = applyFilters(all, { ...DEFAULT_FILTERS, status: 'live', search: 'spirit' })
    expect(r.map(g => g.match_id)).toEqual([1])
    expect(applyFilters(all, { ...DEFAULT_FILTERS, status: 'live', search: 'og' })).toHaveLength(0)
  })
})

describe('leagueOptions', () => {
  it('returns distinct leagues in first-seen order', () => {
    // all = [draft(league 2), finished(league 1), live(league 1)] → league 2 seen first
    expect(leagueOptions(all)).toEqual([
      { id: 2, name: 'DreamLeague' },
      { id: 1, name: 'TI 2026' },
    ])
  })

  it('dedupes repeated leagues', () => {
    const dup = [live, game({ match_id: 9, league_id: 1, league_name: 'TI 2026' })]
    expect(leagueOptions(dup)).toHaveLength(1)
  })
})
