import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// isTrackedLeague decides whether a live match is archived at all, so it is the single
// switch the whole tournament recording depends on. env.ts reads process.env at import
// time, hence the module reset per case.

const BASE = {
  UPSTASH_REDIS_URL: 'rediss://test.upstash.io',
  UPSTASH_REDIS_TOKEN: 'token',
  VALVE_API_KEY: 'key',
  STRATZ_TOKEN: 'token',
}

async function loadEnv(tracked?: string, tiers?: string) {
  vi.resetModules()
  for (const [k, v] of Object.entries(BASE)) process.env[k] = v
  if (tracked === undefined) delete process.env.TRACKED_LEAGUE_IDS
  else process.env.TRACKED_LEAGUE_IDS = tracked
  if (tiers === undefined) delete process.env.ARCHIVE_LEAGUE_TIERS
  else process.env.ARCHIVE_LEAGUE_TIERS = tiers
  return import('./env.js')
}

const saved = { ...process.env }
beforeEach(() => {
  delete process.env.TRACKED_LEAGUE_IDS
})
afterEach(() => {
  process.env = { ...saved }
})

describe('trackedLeagueIds', () => {
  it('parses a single id', async () => {
    const { trackedLeagueIds } = await loadEnv('19719')
    expect([...trackedLeagueIds]).toEqual([19719])
  })

  it('parses a comma-separated list and tolerates spaces', async () => {
    const { trackedLeagueIds } = await loadEnv(' 19719, 18324 ,17599 ')
    expect([...trackedLeagueIds].sort()).toEqual([17599, 18324, 19719])
  })

  it('drops a malformed entry rather than throwing mid-tournament', async () => {
    const { trackedLeagueIds } = await loadEnv('19719,oops,,0,-5')
    expect([...trackedLeagueIds]).toEqual([19719])
  })

  it('is empty when the variable is absent', async () => {
    const { trackedLeagueIds } = await loadEnv(undefined)
    expect(trackedLeagueIds.size).toBe(0)
  })
})

describe('isTrackedLeague', () => {
  it('archives only the configured league', async () => {
    const { isTrackedLeague } = await loadEnv('19719')
    expect(isTrackedLeague(19719)).toBe(true)
    expect(isTrackedLeague(17599)).toBe(false)
  })

  // Was "archives everything when no filter is configured". That default is exactly what
  // filled the disk with amateur ladders, so an empty list no longer means "yes to
  // everything" — it means "this rule does not apply, ask the tier rule instead"
  // (see services/ingest/archivePolicy.ts). isTrackedLeague now answers only the narrow
  // question it is named after: is this league on the explicit list.
  it('claims nothing when no explicit list is configured', async () => {
    const { isTrackedLeague, hasExplicitLeagueList } = await loadEnv('')
    expect(hasExplicitLeagueList()).toBe(false)
    expect(isTrackedLeague(17599)).toBe(false)
    expect(isTrackedLeague(undefined)).toBe(false)
  })

  it('reports an explicit list as exclusive when one IS configured', async () => {
    const { hasExplicitLeagueList } = await loadEnv('19719')
    expect(hasExplicitLeagueList()).toBe(true)
  })

  it('does not archive a match with no league id once a filter is set', async () => {
    // A filtered run must not silently record something it cannot attribute.
    const { isTrackedLeague } = await loadEnv('19719')
    expect(isTrackedLeague(undefined)).toBe(false)
  })
})

// The tier gate that replaced "record every live league match" as the default.
describe('shouldArchiveTier', () => {
  it('records the pro circuit by default and nothing below it', async () => {
    const { shouldArchiveTier } = await loadEnv('')
    expect(shouldArchiveTier('premium')).toBe(true)
    expect(shouldArchiveTier('professional')).toBe(true)
    // The bulk of the live feed on any given evening — ladders, open cups, "SCAM CUP".
    expect(shouldArchiveTier('amateur')).toBe(false)
    expect(shouldArchiveTier('excluded')).toBe(false)
  })

  it('treats an unknown tier as NOT worth recording', async () => {
    // Conservative on purpose: an unindexed league is far more likely to be an amateur cup
    // than a major, and TRACKED_LEAGUE_IDS is the escape hatch for the rare opposite case.
    const { shouldArchiveTier } = await loadEnv('')
    expect(shouldArchiveTier(null)).toBe(false)
    expect(shouldArchiveTier(undefined)).toBe(false)
    expect(shouldArchiveTier('')).toBe(false)
  })

  it('is case- and whitespace-tolerant about what OpenDota sends', async () => {
    const { shouldArchiveTier } = await loadEnv('')
    expect(shouldArchiveTier(' Premium ')).toBe(true)
    expect(shouldArchiveTier('PROFESSIONAL')).toBe(true)
  })

  it('honours an operator-configured tier list', async () => {
    const { shouldArchiveTier } = await loadEnv('', 'premium')
    expect(shouldArchiveTier('premium')).toBe(true)
    expect(shouldArchiveTier('professional')).toBe(false)
  })
})

describe('env — v2.0 Redis configuration', () => {
  it('accepts REDIS_URL on its own, without the Upstash pair', async () => {
    vi.resetModules()
    process.env.VALVE_API_KEY = 'key'
    process.env.STRATZ_TOKEN = 'token'
    process.env.REDIS_URL = 'redis://localhost:6379'
    delete process.env.UPSTASH_REDIS_URL
    delete process.env.UPSTASH_REDIS_TOKEN
    const { env } = await import('./env.js')
    expect(env.REDIS_URL).toBe('redis://localhost:6379')
    delete process.env.REDIS_URL
  })

  it('still demands Upstash when neither is configured', async () => {
    vi.resetModules()
    process.env.VALVE_API_KEY = 'key'
    process.env.STRATZ_TOKEN = 'token'
    delete process.env.REDIS_URL
    delete process.env.UPSTASH_REDIS_URL
    delete process.env.UPSTASH_REDIS_TOKEN
    await expect(import('./env.js')).rejects.toThrow('UPSTASH_REDIS_URL')
  })
})
