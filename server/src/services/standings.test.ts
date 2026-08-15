import { describe, it, expect } from 'vitest'
import { deriveRecords, mergeStandings, type BracketResultNode, type StandingRow } from './standings.js'

const node = (over: Partial<BracketResultNode>): BracketResultNode => ({
  nodeGroupId: 2,
  team1Id: null,
  team2Id: null,
  team1Wins: null,
  team2Wins: null,
  isCompleted: true,
  ...over,
})

const row = (over: Partial<StandingRow> & { teamId: number }): StandingRow => ({
  nodeGroupId: 2,
  standing: 0,
  wins: 0,
  losses: 0,
  ...over,
})

describe('deriveRecords', () => {
  it('credits the series winner and the loser', () => {
    const r = deriveRecords([node({ team1Id: 10, team2Id: 20, team1Wins: 2, team2Wins: 1 })])
    expect(r.get('2:10')).toEqual({ wins: 1, losses: 0 })
    expect(r.get('2:20')).toEqual({ wins: 0, losses: 1 })
  })

  it('accumulates across the group', () => {
    const r = deriveRecords([
      node({ team1Id: 10, team2Id: 20, team1Wins: 2, team2Wins: 0 }),
      node({ team1Id: 30, team2Id: 10, team1Wins: 2, team2Wins: 1 }),
    ])
    expect(r.get('2:10')).toEqual({ wins: 1, losses: 1 })
    expect(r.get('2:30')).toEqual({ wins: 1, losses: 0 })
  })

  it('ignores a series that is still being played', () => {
    // Counting a 1-0 in a Bo3 as a win would show a team ahead before it has won anything.
    const r = deriveRecords([node({ team1Id: 10, team2Id: 20, team1Wins: 1, team2Wins: 0, isCompleted: false })])
    expect(r.size).toBe(0)
  })

  it('counts a draw for neither side', () => {
    const r = deriveRecords([node({ team1Id: 10, team2Id: 20, team1Wins: 1, team2Wins: 1 })])
    expect(r.size).toBe(0)
  })

  it('keeps groups apart', () => {
    const r = deriveRecords([
      node({ nodeGroupId: 2, team1Id: 10, team2Id: 20, team1Wins: 2, team2Wins: 0 }),
      node({ nodeGroupId: 5, team1Id: 10, team2Id: 30, team1Wins: 0, team2Wins: 2 }),
    ])
    expect(r.get('2:10')).toEqual({ wins: 1, losses: 0 })
    expect(r.get('5:10')).toEqual({ wins: 0, losses: 1 })
  })

  it('skips a slot with no team decided yet', () => {
    expect(deriveRecords([node({ team1Id: 10, team2Id: null, team1Wins: 2 })]).size).toBe(0)
  })
})

describe('mergeStandings', () => {
  /**
   * The reported bug: after twelve completed Swiss series, the TI 2026 standings table
   * still showed every team at 0-0 with position 0, because that is verbatim what Valve
   * publishes in team_standings while the bracket beside it holds every result.
   */
  it('fills in a table Valve has left at zero', () => {
    const rows = [row({ teamId: 10 }), row({ teamId: 20 }), row({ teamId: 30 })]
    const records = deriveRecords([
      node({ team1Id: 10, team2Id: 20, team1Wins: 2, team2Wins: 0 }),
      node({ team1Id: 10, team2Id: 30, team1Wins: 2, team2Wins: 1 }),
      node({ team1Id: 20, team2Id: 30, team1Wins: 2, team2Wins: 0 }),
    ])
    const out = mergeStandings(rows, records)
    expect(out.map((r) => [r.teamId, r.wins, r.losses, r.standing])).toEqual([
      [10, 2, 0, 1],
      [20, 1, 1, 2],
      [30, 0, 2, 3],
    ])
  })

  it('never lowers a number Valve has already published', () => {
    // Same rule as the series score: whichever source is ahead wins.
    const out = mergeStandings([row({ teamId: 10, wins: 5, losses: 1, standing: 1 })], new Map())
    expect(out[0]).toMatchObject({ wins: 5, losses: 1, standing: 1 })
  })

  it('leaves Valve’s own ranking alone once it exists', () => {
    const rows = [row({ teamId: 10, standing: 2 }), row({ teamId: 20, standing: 1 })]
    const records = deriveRecords([node({ team1Id: 10, team2Id: 20, team1Wins: 2, team2Wins: 0 })])
    const out = mergeStandings(rows, records)
    // Records still fill in, but positions are Valve's — it knows tiebreakers we do not.
    expect(out.find((r) => r.teamId === 10)).toMatchObject({ wins: 1, standing: 2 })
    expect(out.find((r) => r.teamId === 20)).toMatchObject({ losses: 1, standing: 1 })
  })

  it('does not invent positions before anything has been played', () => {
    // A pre-tournament table is genuinely unranked; numbering it 1..16 would be fiction.
    const out = mergeStandings([row({ teamId: 10 }), row({ teamId: 20 })], new Map())
    expect(out.every((r) => r.standing === 0)).toBe(true)
  })

  it('ranks each group on its own', () => {
    const rows = [
      row({ nodeGroupId: 2, teamId: 10 }),
      row({ nodeGroupId: 2, teamId: 20 }),
      row({ nodeGroupId: 5, teamId: 30 }),
      row({ nodeGroupId: 5, teamId: 40 }),
    ]
    const records = deriveRecords([
      node({ nodeGroupId: 2, team1Id: 20, team2Id: 10, team1Wins: 2, team2Wins: 0 }),
      node({ nodeGroupId: 5, team1Id: 40, team2Id: 30, team1Wins: 2, team2Wins: 0 }),
    ])
    const out = mergeStandings(rows, records)
    expect(out.filter((r) => r.nodeGroupId === 2).map((r) => [r.teamId, r.standing])).toEqual([[20, 1], [10, 2]])
    expect(out.filter((r) => r.nodeGroupId === 5).map((r) => [r.teamId, r.standing])).toEqual([[40, 1], [30, 2]])
  })
})
