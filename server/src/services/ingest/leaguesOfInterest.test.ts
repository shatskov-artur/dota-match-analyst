import { describe, it, expect, vi, beforeEach } from 'vitest'

// The symptom this file exists for, in the owner's own words:
//
//   "I open The International to see tomorrow's schedule. My app has ONE match recorded.
//    Liquipedia already lists five. Why did nothing pull automatically? Why do I have to
//    ask for code changes again?"
//
// Cause: the 5-minute schedule sync walked only TRACKED_LEAGUE_IDS (empty by default since
// tier-based recording) plus leagues with a match in the feed RIGHT NOW. Valve publishes
// the next day's fixtures in the evening, when the feed is empty — so between playing days
// nobody asked, and the schedule froze on whatever had been published during the last live
// match of the day.
//
// Fix: "who to follow" comes from the ARCHIVE — tournaments whose own end date has not
// passed — instead of from whatever happens to be on this minute.

const NOW = 1_786_800_000 // fixed: these assertions are about dates, not about "today"
const DAY = 86_400

type Row = { leagueId: number; endTimestamp: number | null }
let rows: Row[] = []
let queryThrows = false
/** Leagues the archive policy accepts. Everything else is treated as amateur. */
let archivable = new Set<number>()
let policyThrowsFor = new Set<number>()

vi.mock('./archivePolicy.js', () => ({
  shouldArchiveLeague: vi.fn(async (id: number) => {
    if (policyThrowsFor.has(id)) throw new Error('OpenDota unavailable')
    return archivable.has(id)
  }),
}))

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  briefError: (e: unknown) => String(e),
}))

/** Minimal drizzle chain: select().from().where().orderBy() resolves to the filtered rows. */
function chain(cutoff?: number): Record<string, unknown> {
  const p = Promise.resolve([]) as unknown as Record<string, unknown>
  p.from = () => chain(cutoff)
  p.where = () => chain(cutoff)
  p.orderBy = () => {
    if (queryThrows) throw new Error('Connection terminated unexpectedly')
    // Mirrors the SQL predicate: end_timestamp IS NULL OR end_timestamp > cutoff.
    const kept = rows.filter((r) => r.endTimestamp === null || r.endTimestamp > NOW - 3 * DAY)
    // ...and its ordering: latest end date first, nulls last.
    kept.sort((a, b) => (b.endTimestamp ?? -Infinity) - (a.endTimestamp ?? -Infinity))
    return Promise.resolve(kept.map((r) => ({ leagueId: r.leagueId })))
  }
  return p
}

let dbMock: unknown = { select: () => chain() }
vi.mock('../../db/index.js', () => ({
  get db() {
    return dbMock
  },
}))

const { getLeaguesOfInterest, LEAGUE_GRACE_DAYS, MAX_LEAGUES_OF_INTEREST } = await import(
  './leaguesOfInterest.js'
)

beforeEach(() => {
  rows = []
  queryThrows = false
  archivable = new Set()
  policyThrowsFor = new Set()
  dbMock = { select: () => chain() }
})

describe('getLeaguesOfInterest', () => {
  it('follows a running tournament on a day it is NOT playing — the reported symptom', async () => {
    // The International, still running, and the feed is empty because it is 23:00 between
    // playing days. This is the case that used to return nothing at all.
    rows = [{ leagueId: 19719, endTimestamp: NOW + 5 * DAY }]
    archivable = new Set([19719])
    await expect(getLeaguesOfInterest(NOW)).resolves.toEqual([19719])
  })

  it('keeps a tournament that ended yesterday, so a grand final past midnight is not dropped', async () => {
    rows = [{ leagueId: 19719, endTimestamp: NOW - 1 * DAY }]
    archivable = new Set([19719])
    await expect(getLeaguesOfInterest(NOW)).resolves.toEqual([19719])
  })

  it('drops a tournament that ended well outside the grace window', async () => {
    rows = [{ leagueId: 19719, endTimestamp: NOW - (LEAGUE_GRACE_DAYS + 2) * DAY }]
    archivable = new Set([19719])
    await expect(getLeaguesOfInterest(NOW)).resolves.toEqual([])
  })

  it('keeps a league with no end date rather than assuming it is over', async () => {
    // Valve leaves end_timestamp unset often enough that treating unknown as finished
    // would silently stop following live tournaments.
    rows = [{ leagueId: 19719, endTimestamp: null }]
    archivable = new Set([19719])
    await expect(getLeaguesOfInterest(NOW)).resolves.toEqual([19719])
  })

  it('does not follow an amateur ladder just because it never ends', async () => {
    // The other half of "no end date": ladders run forever. The tier policy is what stops
    // this from meaning "every league ever seen".
    rows = [
      { leagueId: 19719, endTimestamp: null },
      { leagueId: 12572, endTimestamp: null },
    ]
    archivable = new Set([19719])
    await expect(getLeaguesOfInterest(NOW)).resolves.toEqual([19719])
  })

  it('skips a league whose tier could not be resolved instead of failing the whole list', async () => {
    rows = [
      { leagueId: 19719, endTimestamp: NOW + 2 * DAY },
      { leagueId: 17599, endTimestamp: NOW + DAY },
    ]
    archivable = new Set([19719, 17599])
    policyThrowsFor = new Set([17599])
    // One unreachable verdict costs that league, never the list: a Promise.all here would
    // reject and silence the whole schedule sync, which is the failure this module ends.
    await expect(getLeaguesOfInterest(NOW)).resolves.toEqual([19719])
  })

  it('caps the set, keeping the most current tournaments', async () => {
    rows = Array.from({ length: MAX_LEAGUES_OF_INTEREST + 5 }, (_, i) => ({
      leagueId: 1000 + i,
      // Higher i = later end date = more current.
      endTimestamp: NOW + i * DAY,
    }))
    archivable = new Set(rows.map((r) => r.leagueId))
    const kept = await getLeaguesOfInterest(NOW)
    expect(kept).toHaveLength(MAX_LEAGUES_OF_INTEREST)
    // The latest-ending league must survive the cap.
    expect(kept[0]).toBe(1000 + MAX_LEAGUES_OF_INTEREST + 4)
  })

  it('returns an empty list, not a throw, when the archive is off', async () => {
    dbMock = null
    await expect(getLeaguesOfInterest(NOW)).resolves.toEqual([])
  })

  it('returns an empty list, not a throw, when the query fails', async () => {
    // The ingest tick must degrade to its old behaviour rather than die.
    queryThrows = true
    rows = [{ leagueId: 19719, endTimestamp: NOW + DAY }]
    archivable = new Set([19719])
    await expect(getLeaguesOfInterest(NOW)).resolves.toEqual([])
  })
})
