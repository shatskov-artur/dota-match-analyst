import { describe, it, expect, vi, beforeEach } from 'vitest'

// E-1 — what gets recorded when nobody named a tournament.
//
// The old default was "every live league match", which on a quiet Tuesday means twenty
// FACEIT ladders and community cups writing ~3 MB of snapshots per match per game, none of
// which anyone would ever open. The new default records the pro circuit by calibre, and an
// explicit id list still overrides everything.

const leagueTiers = new Map<number, string | null>([
  [19719, 'premium'], // The International
  [17599, 'professional'], // tier 2-3 circuit
  [12572, 'amateur'], // Underdogs Amateur League
  [99999, null], // OpenDota has the league but no tier
])

let failNext = false

vi.mock('../openDotaApi.js', () => ({
  getLeagueInfo: vi.fn(async (leagueId: number) => {
    if (failNext) throw new Error('OpenDota unavailable: 503 Service Unavailable')
    if (!leagueTiers.has(leagueId)) return null // unknown league
    return { name: `League ${leagueId}`, tier: leagueTiers.get(leagueId) ?? null }
  }),
}))

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  briefError: (e: unknown) => String(e),
}))

const BASE = {
  UPSTASH_REDIS_URL: 'rediss://test.upstash.io',
  UPSTASH_REDIS_TOKEN: 'token',
  VALVE_API_KEY: 'key',
  STRATZ_TOKEN: 'token',
}

async function load(tracked?: string, tiers?: string) {
  vi.resetModules()
  for (const [k, v] of Object.entries(BASE)) process.env[k] = v
  if (tracked === undefined) delete process.env.TRACKED_LEAGUE_IDS
  else process.env.TRACKED_LEAGUE_IDS = tracked
  if (tiers === undefined) delete process.env.ARCHIVE_LEAGUE_TIERS
  else process.env.ARCHIVE_LEAGUE_TIERS = tiers
  return import('./archivePolicy.js')
}

beforeEach(() => {
  failNext = false
})

describe('shouldArchiveLeague — no explicit list (tier decides)', () => {
  it('records The International', async () => {
    const { shouldArchiveLeague } = await load('')
    await expect(shouldArchiveLeague(19719)).resolves.toBe(true)
  })

  it('records the tier 2-3 circuit', async () => {
    const { shouldArchiveLeague } = await load('')
    await expect(shouldArchiveLeague(17599)).resolves.toBe(true)
  })

  it('does NOT record an amateur league — the case this exists for', async () => {
    const { shouldArchiveLeague } = await load('')
    await expect(shouldArchiveLeague(12572)).resolves.toBe(false)
  })

  it('does not record a league OpenDota has never heard of', async () => {
    const { shouldArchiveLeague } = await load('')
    await expect(shouldArchiveLeague(4242)).resolves.toBe(false)
  })

  it('does not record a league with no tier at all', async () => {
    const { shouldArchiveLeague } = await load('')
    await expect(shouldArchiveLeague(99999)).resolves.toBe(false)
  })

  it('does not record a match with no league id', async () => {
    const { shouldArchiveLeague } = await load('')
    await expect(shouldArchiveLeague(undefined)).resolves.toBe(false)
    await expect(shouldArchiveLeague(0)).resolves.toBe(false)
  })
})

describe('shouldArchiveLeague — explicit list is exclusive and absolute', () => {
  it('records a listed league even though it is amateur', async () => {
    // The escape hatch: an id is an instruction, not a preference.
    const { shouldArchiveLeague } = await load('12572')
    await expect(shouldArchiveLeague(12572)).resolves.toBe(true)
  })

  it('refuses a premium league that is NOT on the list', async () => {
    const { shouldArchiveLeague } = await load('12572')
    await expect(shouldArchiveLeague(19719)).resolves.toBe(false)
  })

  it('never consults OpenDota for a listed league', async () => {
    // A tournament announced yesterday is not indexed yet; the id must still work.
    failNext = true
    const { shouldArchiveLeague } = await load('19719')
    await expect(shouldArchiveLeague(19719)).resolves.toBe(true)
  })
})

describe('shouldArchiveLeague — when the tier cannot be resolved', () => {
  it('skips rather than recording blind', async () => {
    failNext = true
    const { shouldArchiveLeague } = await load('')
    await expect(shouldArchiveLeague(19719)).resolves.toBe(false)
  })

  it('does not memoise the failure — the next tick asks again', async () => {
    const { shouldArchiveLeague } = await load('')
    failNext = true
    await expect(shouldArchiveLeague(19719)).resolves.toBe(false)
    failNext = false
    await expect(shouldArchiveLeague(19719)).resolves.toBe(true)
  })
})

describe('filterArchivableLeagues', () => {
  it('keeps only what is worth recording, de-duplicated', async () => {
    const { filterArchivableLeagues } = await load('')
    const kept = await filterArchivableLeagues([19719, 12572, 17599, 19719, 4242])
    expect(kept.sort()).toEqual([17599, 19719])
  })

  it('is empty rather than undefined when nothing qualifies', async () => {
    const { filterArchivableLeagues } = await load('')
    await expect(filterArchivableLeagues([12572, 4242])).resolves.toEqual([])
  })
})
