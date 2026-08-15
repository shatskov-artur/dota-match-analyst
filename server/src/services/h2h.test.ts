import { describe, it, expect } from 'vitest'
import { didWin, toFormEntry, recentForm, headToHead, buildH2H } from './h2h.js'
import type { TeamMatch } from './openDotaApi.js'

// Shape verified against OpenDota /teams/2163/matches on 2026-08-12.
const row = (over: Partial<TeamMatch> = {}): TeamMatch => ({
  match_id: 1,
  radiant: true,
  radiant_win: true,
  radiant_score: 30,
  dire_score: 20,
  duration: 2400,
  start_time: 1_785_000_000,
  leagueid: 100,
  league_name: 'Some League',
  opposing_team_id: 999,
  opposing_team_name: 'Them',
  opposing_team_logo: 'https://cdn/logo.png',
  ...over,
})

describe('didWin', () => {
  it('is a win when the team played the side that won', () => {
    expect(didWin(row({ radiant: true, radiant_win: true }))).toBe(true)
    expect(didWin(row({ radiant: false, radiant_win: false }))).toBe(true)
  })

  it('is a loss when the team played the side that lost', () => {
    // The trap this exists for: radiant_win describes the SIDE, not the team.
    expect(didWin(row({ radiant: false, radiant_win: true }))).toBe(false)
    expect(didWin(row({ radiant: true, radiant_win: false }))).toBe(false)
  })

  it('is unknown when the side or the result is missing', () => {
    expect(didWin(row({ radiant: undefined }))).toBeNull()
    expect(didWin(row({ radiant_win: undefined }))).toBeNull()
  })
})

describe('toFormEntry', () => {
  it('reports the score from the team own point of view when it played Radiant', () => {
    expect(toFormEntry(row({ radiant: true }))!.score).toEqual({ own: 30, opponent: 20 })
  })

  it('flips the score when the team played Dire', () => {
    expect(toFormEntry(row({ radiant: false, radiant_win: false }))!.score).toEqual({ own: 20, opponent: 30 })
  })

  it('carries the opponent name and logo straight through', () => {
    const e = toFormEntry(row())!
    expect(e.opponentName).toBe('Them')
    expect(e.opponentLogo).toBe('https://cdn/logo.png')
  })

  it('drops rows whose result cannot be determined', () => {
    expect(toFormEntry(row({ radiant: undefined }))).toBeNull()
  })
})

describe('recentForm', () => {
  it('keeps at most the requested number of results', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row({ match_id: i }))
    expect(recentForm(rows, 5)).toHaveLength(5)
  })

  it('preserves the incoming (newest-first) order', () => {
    const rows = [row({ match_id: 3 }), row({ match_id: 2 }), row({ match_id: 1 })]
    expect(recentForm(rows).map((f) => f.matchId)).toEqual([3, 2, 1])
  })

  it('handles a team OpenDota knows nothing about', () => {
    expect(recentForm(null)).toEqual([])
  })
})

describe('headToHead', () => {
  const history = [
    row({ match_id: 1, opposing_team_id: 999, radiant: true, radiant_win: true }),
    row({ match_id: 2, opposing_team_id: 999, radiant: false, radiant_win: true }), // loss
    row({ match_id: 3, opposing_team_id: 111, radiant: true, radiant_win: true }), // other opponent
  ]

  it('counts only meetings with the given opponent', () => {
    const h = headToHead(history, 999)
    expect(h.matches).toHaveLength(2)
    expect(h.wins).toBe(1)
    expect(h.losses).toBe(1)
    expect(h.matchedBy).toBe('id')
  })

  it('returns an empty record when the opponent is unknown', () => {
    expect(headToHead(history, null)).toEqual({ wins: 0, losses: 0, matches: [], matchedBy: 'none' })
  })

  it('returns an empty record for two teams that have never met', () => {
    expect(headToHead(history, 4242).matches).toEqual([])
  })

  it('falls back to the team name when the id finds nothing', () => {
    // Verified against real data: outside the top tier the same org is registered under
    // several ids, and Valve's live feed can report yet another one.
    const shinigami = [
      row({ match_id: 10, opposing_team_id: 9677506, opposing_team_name: 'Shinigami Gaming', radiant: true, radiant_win: true }),
      row({ match_id: 11, opposing_team_id: 9692516, opposing_team_name: 'Shinigami Gaming', radiant: true, radiant_win: false }),
    ]
    const h = headToHead(shinigami, 9886115, 'Shinigami Gaming')
    expect(h.matches).toHaveLength(2)
    expect(h.wins).toBe(1)
    expect(h.losses).toBe(1)
    expect(h.matchedBy).toBe('name')
  })

  it('prefers the id match and never falls back when the id already hit', () => {
    const mixed = [
      row({ match_id: 1, opposing_team_id: 999, opposing_team_name: 'Them', radiant: true, radiant_win: true }),
      row({ match_id: 2, opposing_team_id: 555, opposing_team_name: 'Them', radiant: true, radiant_win: false }),
    ]
    const h = headToHead(mixed, 999, 'Them')
    expect(h.matchedBy).toBe('id')
    expect(h.matches).toHaveLength(1)
  })

  it('normalises case and spacing before comparing names', () => {
    const rows = [row({ opposing_team_id: 1, opposing_team_name: '  team   SPIRIT ' })]
    expect(headToHead(rows, 42, 'Team Spirit').matchedBy).toBe('name')
  })

  it('does not name-match on an empty opponent name', () => {
    const rows = [row({ opposing_team_id: 1, opposing_team_name: null })]
    expect(headToHead(rows, 42, null).matchedBy).toBe('none')
  })
})

describe('buildH2H', () => {
  it('reports the record from the Radiant team point of view', () => {
    const radiantHistory = [row({ match_id: 1, opposing_team_id: 777, radiant: true, radiant_win: true })]
    const direHistory = [row({ match_id: 1, opposing_team_id: 2163, radiant: false, radiant_win: true })]
    const out = buildH2H({
      radiantTeamId: 2163,
      direTeamId: 777,
      radiantMatches: radiantHistory,
      direMatches: direHistory,
    })
    expect(out.h2h.wins).toBe(1)
    expect(out.h2h.losses).toBe(0)
    expect(out.radiant.teamId).toBe(2163)
    expect(out.dire.teamId).toBe(777)
  })

  it('still returns one side form when the other team is missing upstream', () => {
    const out = buildH2H({ radiantTeamId: 2163, direTeamId: 777, radiantMatches: [row()], direMatches: null })
    expect(out.radiant.form).toHaveLength(1)
    expect(out.dire.form).toEqual([])
  })

  it('passes the dire team name through so the h2h name fallback can fire', () => {
    const history = [row({ opposing_team_id: 111, opposing_team_name: 'Them', radiant: true, radiant_win: true })]
    const out = buildH2H({
      radiantTeamId: 1,
      direTeamId: 999,
      direName: 'Them',
      radiantMatches: history,
      direMatches: null,
    })
    expect(out.h2h.matchedBy).toBe('name')
    expect(out.h2h.wins).toBe(1)
  })
})
