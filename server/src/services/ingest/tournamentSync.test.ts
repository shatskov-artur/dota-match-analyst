import { describe, it, expect, vi } from 'vitest'

vi.mock('../../db/index.js', () => ({ db: null }))
vi.mock('../valveApi.js', () => ({ getLeagueData: vi.fn() }))
vi.mock('../openDotaApi.js', () => ({ getLeagueMatches: vi.fn() }))
// env.ts validates VALVE_API_KEY etc. at import time and would throw in a unit test.
vi.mock('../../env.js', () => ({
  env: {},
  trackedLeagueIds: new Set<number>(),
  isTrackedLeague: () => true,
}))
vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  briefError: (e: unknown) => String(e),
}))

import { isLeagueCurrent, groupLeagueMatches } from './tournamentSync.js'
import type { LeagueMatch } from '../openDotaApi.js'

const NOW = 1_786_000_000 // fixed clock; Date.now() would make these flaky
const days = (n: number) => n * 86_400

describe('isLeagueCurrent', () => {
  it('accepts a league that has not finished yet', () => {
    expect(isLeagueCurrent({ end_timestamp: NOW + days(5) }, [], NOW)).toBe(true)
  })

  it('accepts one that finished within the grace window', () => {
    // A tournament should not vanish the morning after its grand final.
    expect(isLeagueCurrent({ end_timestamp: NOW - days(3) }, [], NOW)).toBe(true)
  })

  it('rejects an abandoned bracket template', () => {
    // The real case: Underdogs Amateur League 12572 — 105 nodes with real team names,
    // season ended February 2021, last activity November 2020, every scheduled_time 0.
    // Matches are still played under that league id today, which is how it got synced.
    const stale = { end_timestamp: 1_614_470_400, most_recent_activity: 1_604_431_793 }
    const nodes = Array.from({ length: 105 }, () => ({ scheduled_time: 0 }))
    expect(isLeagueCurrent(stale, nodes, NOW)).toBe(false)
  })

  it('accepts a stale-looking league that still has a future fixture', () => {
    // A published future match is proof of life even when the header dates disagree.
    const stale = { end_timestamp: NOW - days(400), most_recent_activity: NOW - days(400) }
    expect(isLeagueCurrent(stale, [{ scheduled_time: NOW + days(1) }], NOW)).toBe(true)
  })

  it('does not count a fixture that has already passed as proof of life', () => {
    const stale = { end_timestamp: NOW - days(400) }
    expect(isLeagueCurrent(stale, [{ scheduled_time: NOW - days(200) }], NOW)).toBe(false)
  })

  it('accepts recent activity even with no end date at all', () => {
    expect(isLeagueCurrent({ most_recent_activity: NOW - days(1) }, [], NOW)).toBe(true)
  })

  it('rejects a league with no dates and no fixtures', () => {
    expect(isLeagueCurrent({}, [], NOW)).toBe(false)
  })
})

describe('groupLeagueMatches', () => {
  const m = (over: Partial<LeagueMatch> & { match_id: number }): LeagueMatch => ({
    start_time: 0,
    series_id: null,
    series_type: null,
    ...over,
  })

  it('numbers the maps of a series in the order they were played', () => {
    // The real EPL Masters Bo5 (series 1129810), which is how this was verified: three
    // maps, discovered from OpenDota alone with no Valve bracket involved at all.
    const { stubs, seriesRows } = groupLeagueMatches(19944, [
      m({ match_id: 8942003788, start_time: 1786541323, series_id: 1129810, series_type: 2 }),
      m({ match_id: 8942152024, start_time: 1786545359, series_id: 1129810, series_type: 2 }),
      m({ match_id: 8942262723, start_time: 1786549230, series_id: 1129810, series_type: 2 }),
    ])
    expect(stubs.map((s) => [s.matchId, s.gameInSeries])).toEqual([
      [8942003788, 1],
      [8942152024, 2],
      [8942262723, 3],
    ])
    expect(seriesRows).toHaveLength(1)
    expect(seriesRows[0].matchIds).toEqual([8942003788, 8942152024, 8942262723])
    expect(seriesRows[0].seriesType).toBe(2)
  })

  it('sorts before numbering, so one out-of-order row cannot renumber a series', () => {
    const { stubs } = groupLeagueMatches(1, [
      m({ match_id: 300, start_time: 300, series_id: 7 }),
      m({ match_id: 100, start_time: 100, series_id: 7 }),
      m({ match_id: 200, start_time: 200, series_id: 7 }),
    ])
    expect(stubs.map((s) => [s.matchId, s.gameInSeries])).toEqual([
      [100, 1],
      [200, 2],
      [300, 3],
    ])
  })

  it('keeps series independent of one another', () => {
    const { stubs, seriesRows } = groupLeagueMatches(1, [
      m({ match_id: 1, start_time: 10, series_id: 7 }),
      m({ match_id: 2, start_time: 20, series_id: 8 }),
      m({ match_id: 3, start_time: 30, series_id: 7 }),
    ])
    expect(stubs.find((s) => s.matchId === 3)?.gameInSeries).toBe(2)
    expect(stubs.find((s) => s.matchId === 2)?.gameInSeries).toBe(1)
    expect(seriesRows).toHaveLength(2)
  })

  it('still stubs a match that belongs to no series', () => {
    // A showmatch or a one-off: it must reach the backfill queue regardless.
    const { stubs, seriesRows } = groupLeagueMatches(1, [m({ match_id: 5, series_id: 0 })])
    expect(stubs).toEqual([
      { matchId: 5, leagueId: 1, seriesId: null, gameInSeries: null, ingestStatus: 'awaiting_parse' },
    ])
    expect(seriesRows).toEqual([])
  })

  it('marks every stub awaiting_parse so the backfill tick picks it up', () => {
    const { stubs } = groupLeagueMatches(1, [m({ match_id: 1 }), m({ match_id: 2 })])
    expect(stubs.every((s) => s.ingestStatus === 'awaiting_parse')).toBe(true)
  })
})
