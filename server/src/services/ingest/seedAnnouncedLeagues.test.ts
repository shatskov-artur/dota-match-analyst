import { describe, it, expect, vi, beforeEach } from 'vitest'

// Learning about a tournament BEFORE its first game.
//
// getLeaguesOfInterest follows anything already in the archive, and a league earns its row
// from its first live match — so the one window it cannot see into is the beginning, which
// is exactly when a schedule page has something to say and nothing to show. The owner's
// ask was that this stop requiring a code change: "so it pulls those ids automatically".
//
// The risk here is the opposite of the bug: OpenDota's catalogue has thousands of leagues
// and Valve keeps abandoned bracket templates forever, so an over-eager sweep would either
// burn quota or fill the app with ghost tournaments. These cases pin the bounds.

const NOW = 1_786_800_000
const DAY = 86_400

let catalogue: Array<{ leagueid: number; name: string | null; tier: string | null }> | null = []
let catalogueThrows = false
/** leagueId → nodes returned by GetLeagueData, or null for "no data". */
let brackets = new Map<number, Array<{ scheduled_time?: number }> | null>()
let known = new Set<number>()
let inserted: number[] = []
let probed: number[] = []

vi.mock('../openDotaApi.js', () => ({
  getAllLeagues: vi.fn(async () => {
    if (catalogueThrows) throw new Error('OpenDota unavailable: 503')
    return catalogue
  }),
}))

vi.mock('../valveApi.js', () => ({
  getLeagueData: vi.fn(async (leagueId: number) => {
    probed.push(leagueId)
    const nodes = brackets.get(leagueId)
    if (nodes === undefined || nodes === null) return null
    return { info: { name: `League ${leagueId}` }, node_groups: [{ nodes }] }
  }),
}))

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  briefError: (e: unknown) => String(e),
}))

function selectChain(): Record<string, unknown> {
  const p = Promise.resolve([]) as unknown as Record<string, unknown>
  p.from = () => selectChain()
  p.where = () => Promise.resolve([...known].map((leagueId) => ({ leagueId })))
  return p
}

function insertChain(): Record<string, unknown> {
  const p = Promise.resolve([]) as unknown as Record<string, unknown>
  p.values = (v: { leagueId: number }) => {
    inserted.push(v.leagueId)
    return insertChain()
  }
  p.onConflictDoNothing = () => Promise.resolve([])
  return p
}

let dbMock: unknown = { select: () => selectChain(), insert: () => insertChain() }
vi.mock('../../db/index.js', () => ({
  get db() {
    return dbMock
  },
}))

const BASE = {
  UPSTASH_REDIS_URL: 'rediss://test.upstash.io',
  UPSTASH_REDIS_TOKEN: 'token',
  VALVE_API_KEY: 'key',
  STRATZ_TOKEN: 'token',
}
for (const [k, v] of Object.entries(BASE)) process.env[k] = v
process.env.TRACKED_LEAGUE_IDS = ''
delete process.env.ARCHIVE_LEAGUE_TIERS

const { seedAnnouncedLeagues, PROBE_BUDGET } = await import('./seedAnnouncedLeagues.js')

beforeEach(() => {
  catalogue = []
  catalogueThrows = false
  brackets = new Map()
  known = new Set()
  inserted = []
  probed = []
  dbMock = { select: () => selectChain(), insert: () => insertChain() }
})

describe('seedAnnouncedLeagues', () => {
  it('seeds a premium tournament whose bracket already has future fixtures', async () => {
    catalogue = [{ leagueid: 19800, name: 'The International 2027', tier: 'premium' }]
    brackets.set(19800, [{ scheduled_time: NOW + 10 * DAY }])
    const r = await seedAnnouncedLeagues(NOW)
    expect(r.seeded).toEqual([19800])
    expect(inserted).toEqual([19800])
  })

  it('ignores an abandoned bracket template with no future fixture', async () => {
    // Valve keeps five-year-old brackets around with scheduled_time 0. A new id is not on
    // its own a reason to follow anything.
    catalogue = [{ leagueid: 19801, name: 'Dead Cup', tier: 'professional' }]
    brackets.set(19801, [{ scheduled_time: 0 }, { scheduled_time: NOW - 400 * DAY }])
    const r = await seedAnnouncedLeagues(NOW)
    expect(r.seeded).toEqual([])
    expect(inserted).toEqual([])
  })

  it('ignores a fixture so far out it is a placeholder rather than a schedule', async () => {
    catalogue = [{ leagueid: 19802, name: 'Someday Cup', tier: 'premium' }]
    brackets.set(19802, [{ scheduled_time: NOW + 400 * DAY }])
    await expect(seedAnnouncedLeagues(NOW)).resolves.toMatchObject({ seeded: [] })
  })

  it('never probes an amateur league, whatever its bracket says', async () => {
    catalogue = [{ leagueid: 19803, name: 'Open Ladder', tier: 'amateur' }]
    brackets.set(19803, [{ scheduled_time: NOW + DAY }])
    const r = await seedAnnouncedLeagues(NOW)
    expect(probed).toEqual([])
    expect(r.seeded).toEqual([])
  })

  it('does not spend the budget on leagues the archive already follows', async () => {
    catalogue = [
      { leagueid: 19810, name: 'Known', tier: 'premium' },
      { leagueid: 19809, name: 'New', tier: 'premium' },
    ]
    known = new Set([19810])
    brackets.set(19809, [{ scheduled_time: NOW + DAY }])
    await seedAnnouncedLeagues(NOW)
    expect(probed).toEqual([19809])
  })

  it('probes the NEWEST ids first — an upcoming tournament is a recent registration', async () => {
    catalogue = [
      { leagueid: 100, name: 'Ancient', tier: 'premium' },
      { leagueid: 19_900, name: 'Newest', tier: 'premium' },
      { leagueid: 5_000, name: 'Old', tier: 'premium' },
    ]
    await seedAnnouncedLeagues(NOW)
    expect(probed[0]).toBe(19_900)
  })

  it('honours the probe budget so one pass cannot become hundreds of calls', async () => {
    catalogue = Array.from({ length: 200 }, (_, i) => ({
      leagueid: 20_000 + i,
      name: `L${i}`,
      tier: 'premium' as const,
    }))
    const r = await seedAnnouncedLeagues(NOW)
    expect(r.probed).toBe(PROBE_BUDGET)
    expect(probed).toHaveLength(PROBE_BUDGET)
  })

  it('survives an unreachable catalogue without throwing into the ingest tick', async () => {
    catalogueThrows = true
    await expect(seedAnnouncedLeagues(NOW)).resolves.toEqual({ probed: 0, seeded: [] })
  })

  it('survives one failing probe and keeps going', async () => {
    catalogue = [
      { leagueid: 19_902, name: 'Breaks', tier: 'premium' },
      { leagueid: 19_901, name: 'Works', tier: 'premium' },
    ]
    brackets.set(19_901, [{ scheduled_time: NOW + DAY }])
    // 19_902 has no entry → getLeagueData returns null → skipped, not fatal.
    const r = await seedAnnouncedLeagues(NOW)
    expect(r.seeded).toEqual([19_901])
  })

  it('does nothing at all when the archive is off', async () => {
    dbMock = null
    catalogue = [{ leagueid: 19_950, name: 'X', tier: 'premium' }]
    await expect(seedAnnouncedLeagues(NOW)).resolves.toEqual({ probed: 0, seeded: [] })
  })
})
