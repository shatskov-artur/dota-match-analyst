import { describe, it, expect } from 'vitest'
import { resolveArchiveResponse } from './archiveSnapshot'

/**
 * Resolver tests run against the real export in demo-data/archive/, not a fixture.
 *
 * That is the point: the module's whole job is to find the files that were actually
 * written, and a mocked glob would pass while every path in the build was wrong. The ids
 * below are chosen for what they demonstrate and for being among the smallest files that
 * demonstrate it — the loaders are lazy, so a test only pays for what it opens.
 */

/** The exported tournament. */
const LEAGUE = 19719

/** 61-minute match, /at recorded for minutes 54..60 only — the whole nearest-minute story. */
const MATCH_WITH_AT = 8947050343
const AT_MINUTES = { first: 54, last: 60 }

/** Recorded timeline and analysis, no live snapshots — so no /at file, and h2h 404'd. */
const MATCH_WITHOUT_AT = 8960762254

/** The series MATCH_WITH_AT belongs to. */
const SERIES = 1130710

interface MinuteResponse {
  matchId: number
  t: number
  minute: number
  exact: boolean
  reconstructed: boolean
}

const asMinute = (v: unknown): MinuteResponse => v as MinuteResponse

describe('resolveArchiveResponse — tournament endpoints', () => {
  it('serves the league list', async () => {
    const res = (await resolveArchiveResponse('/api/tournaments')) as {
      tournaments: Array<{ leagueId: number }>
    } | null
    expect(res).not.toBeNull()
    expect(res!.tournaments.some((t) => t.leagueId === LEAGUE)).toBe(true)
  })

  it('serves the bracket and the schedule of the exported league', async () => {
    const bracket = (await resolveArchiveResponse(`/api/tournaments/${LEAGUE}/bracket`)) as {
      nodes: unknown[]
      standings: unknown[]
    } | null
    expect(bracket!.nodes.length).toBeGreaterThan(0)
    expect(bracket!.standings.length).toBeGreaterThan(0)

    const schedule = (await resolveArchiveResponse(`/api/tournaments/${LEAGUE}/schedule`)) as {
      schedule: unknown[]
    } | null
    expect(schedule!.schedule.length).toBeGreaterThan(0)
  })

  it('has nothing for a league that was not exported', async () => {
    expect(await resolveArchiveResponse('/api/tournaments/1/bracket')).toBeNull()
    expect(await resolveArchiveResponse('/api/tournaments/1/schedule')).toBeNull()
  })

  it('serves the match list per league, and only per league', async () => {
    const list = (await resolveArchiveResponse(`/api/matches?leagueId=${LEAGUE}&limit=200`)) as {
      matches: unknown[]
    } | null
    expect(list!.matches.length).toBeGreaterThan(0)
    // The export is per league; there is no cross-league list to answer with.
    expect(await resolveArchiveResponse('/api/matches')).toBeNull()
    expect(await resolveArchiveResponse('/api/matches?status=live')).toBeNull()
  })
})

describe('resolveArchiveResponse — per-match endpoints', () => {
  it('unbundles each member of match/<id>.json', async () => {
    const timeline = (await resolveArchiveResponse(
      `/api/matches/${MATCH_WITHOUT_AT}/timeline`,
    )) as { matchId: number; events: unknown[] } | null
    expect(timeline!.matchId).toBe(MATCH_WITHOUT_AT)
    expect(timeline!.events.length).toBeGreaterThan(0)

    for (const member of ['analysis', 'series', 'snapshots'] as const) {
      expect(await resolveArchiveResponse(`/api/matches/${MATCH_WITHOUT_AT}/${member}`)).not.toBeNull()
    }
  })

  it('reports a recorded 404 as absent rather than inventing a body', async () => {
    // h2h answered 404 at export time for this match; the bundle stores that as null.
    expect(await resolveArchiveResponse(`/api/matches/${MATCH_WITHOUT_AT}/h2h`)).toBeNull()
  })

  it('has nothing for a match outside the export, or an endpoint it never held', async () => {
    expect(await resolveArchiveResponse('/api/matches/1/timeline')).toBeNull()
    expect(await resolveArchiveResponse(`/api/matches/${MATCH_WITHOUT_AT}/nonsense`)).toBeNull()
  })

  it('resolves a series through the per-league match list', async () => {
    const res = (await resolveArchiveResponse(`/api/series/${SERIES}`)) as {
      series: { seriesId: number }
      games: unknown[]
    } | null
    expect(res!.series.seriesId).toBe(SERIES)
    expect(res!.games.length).toBeGreaterThan(0)
    expect(await resolveArchiveResponse('/api/series/1')).toBeNull()
  })
})

describe('resolveArchiveResponse — time travel', () => {
  const at = (q: string) => resolveArchiveResponse(`/api/matches/${MATCH_WITH_AT}/at?${q}`)

  it('returns the exact minute when it was recorded', async () => {
    const res = asMinute(await at(`minute=${AT_MINUTES.first + 2}`))
    expect(res.minute).toBe(AT_MINUTES.first + 2)
    expect(res.matchId).toBe(MATCH_WITH_AT)
  })

  it('falls back to the nearest EARLIER minute, never a later one', async () => {
    const res = asMinute(await at('minute=200'))
    expect(res.minute).toBe(AT_MINUTES.last)
  })

  it('answers a minute before the recording with the earliest one it has', async () => {
    // Mirrors the server, which falls back to the first snapshot rather than 404ing.
    const res = asMinute(await at('minute=0'))
    expect(res.minute).toBe(AT_MINUTES.first)
  })

  it('accepts ?t= in seconds and resolves it to the minute containing it', async () => {
    const res = asMinute(await at(`t=${(AT_MINUTES.first + 1) * 60 + 30}`))
    expect(res.minute).toBe(AT_MINUTES.first + 1)
  })

  it('passes the recorded response flags through untouched', async () => {
    const res = asMinute(await at(`minute=${AT_MINUTES.first}`))
    expect(res.exact).toBe(true)
    expect(res.reconstructed).toBe(false)
    expect(res.t).toBeGreaterThan(0)
  })

  it('has nothing for a match with no per-minute state recorded', async () => {
    expect(await resolveArchiveResponse(`/api/matches/${MATCH_WITHOUT_AT}/at?minute=10`)).toBeNull()
  })

  it('rejects a minute that is not a whole non-negative number', async () => {
    expect(await at('minute=-1')).toBeNull()
    expect(await at('minute=abc')).toBeNull()
    expect(await at('')).toBeNull()
  })
})

describe('resolveArchiveResponse — synthesised status', () => {
  it('reports the export as a configured, reachable archive of the exported league', async () => {
    const res = (await resolveArchiveResponse('/api/archive/status')) as {
      configured: boolean
      reachable: boolean
      counts: Record<string, number>
      trackedLeagueIds: number[]
      trackedLeagues: Array<{ leagueId: number; name: string | null }>
    } | null
    expect(res!.configured).toBe(true)
    expect(res!.reachable).toBe(true)
    expect(res!.trackedLeagueIds).toEqual([LEAGUE])
    expect(res!.trackedLeagues[0].name).toBe('The International 2026')
    expect(res!.counts.matches).toBeGreaterThan(0)
    expect(res!.counts.minutes).toBeGreaterThan(0)
  })
})

describe('resolveArchiveResponse — unknown paths', () => {
  it('answers nothing for endpoints the export does not cover', async () => {
    // Real endpoints, deliberately not exported: absent, not stubbed.
    expect(await resolveArchiveResponse('/api/schedule/range?from=0&to=1')).toBeNull()
    expect(await resolveArchiveResponse(`/api/tournaments/${LEAGUE}/nodes/1`)).toBeNull()
    expect(await resolveArchiveResponse('/api/live/games')).toBeNull()
    expect(await resolveArchiveResponse('/nope')).toBeNull()
  })
})
