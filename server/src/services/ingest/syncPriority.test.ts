import { describe, it, expect, vi, beforeEach } from 'vitest'

// The cap decides who actually gets asked, so the ORDER under it is the difference between
// "The International's fixtures updated" and "they did not".
//
// syncLeagues walks at most MAX_LEAGUES_PER_SYNC leagues per tick. With only two ranks —
// tracked, then everything else — a busy evening of amateur games could push a running
// tournament past the cap on a day it was between matches, which is precisely the window in
// which its next fixtures get published. The middle rank exists for that.

const BASE = {
  UPSTASH_REDIS_URL: 'rediss://test.upstash.io',
  UPSTASH_REDIS_TOKEN: 'token',
  VALVE_API_KEY: 'key',
  STRATZ_TOKEN: 'token',
}

/** Leagues syncLeague() was actually asked about, in order. */
let asked: number[] = []

vi.mock('../valveApi.js', () => ({
  // Returning null makes syncLeague log an upstream miss and return early — enough to
  // record WHICH leagues were reached without standing up a database.
  getLeagueData: vi.fn(async (leagueId: number) => {
    asked.push(leagueId)
    return null
  }),
}))

vi.mock('../openDotaApi.js', () => ({
  getLeagueMatches: vi.fn(async () => null),
}))

vi.mock('./archivePolicy.js', () => ({
  shouldArchiveLeague: vi.fn(async () => true),
}))

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  briefError: (e: unknown) => String(e),
}))

// A db that is merely truthy: syncLeague bails at the getLeagueData miss above, long before
// it writes anything.
vi.mock('../../db/index.js', () => ({ db: { select: () => ({}) } }))

async function load(tracked: string) {
  vi.resetModules()
  for (const [k, v] of Object.entries(BASE)) process.env[k] = v
  process.env.TRACKED_LEAGUE_IDS = tracked
  delete process.env.ARCHIVE_LEAGUE_TIERS
  asked = []
  return import('./tournamentSync.js')
}

beforeEach(() => {
  asked = []
})

describe('syncLeagues — who survives the cap', () => {
  it('asks about a running tournament even when a full slate of ladders is live', async () => {
    // THE REGRESSION. TI (19719) is between matches, so it is NOT in the live set; thirty
    // amateur leagues are on right now. Before the middle rank existed, TI either was not
    // in the set at all or sat behind the ladders and fell off the cap.
    const { syncLeagues, MAX_LEAGUES_PER_SYNC } = await load('')
    const ladders = Array.from({ length: 30 }, (_, i) => 90_000 + i)

    await syncLeagues([...ladders, 19719], new Set([19719]))

    expect(asked).toContain(19719)
    expect(asked).toHaveLength(MAX_LEAGUES_PER_SYNC)
  })

  it('puts an explicitly tracked league ahead of an active one', async () => {
    const { syncLeagues } = await load('17599')
    await syncLeagues([90_001, 19719, 17599], new Set([19719]))
    expect(asked[0]).toBe(17599)
    expect(asked[1]).toBe(19719)
  })

  it('puts an active tournament ahead of one that is merely live this minute', async () => {
    const { syncLeagues } = await load('')
    await syncLeagues([90_001, 90_002, 19719], new Set([19719]))
    expect(asked[0]).toBe(19719)
  })

  it('still syncs live leagues — following tournaments did not replace covering the scene', async () => {
    const { syncLeagues } = await load('')
    await syncLeagues([90_001, 19719], new Set([19719]))
    expect(asked).toEqual(expect.arrayContaining([90_001, 19719]))
  })

  it('de-duplicates a league that is tracked, active AND live at once', async () => {
    const { syncLeagues } = await load('19719')
    await syncLeagues([19719, 19719, 19719], new Set([19719]))
    expect(asked).toEqual([19719])
  })

  it('behaves exactly as before when no active set is supplied', async () => {
    // Back-compatible: the parameter defaults to empty, so existing callers are unaffected.
    const { syncLeagues } = await load('17599')
    await syncLeagues([90_001, 17599])
    expect(asked[0]).toBe(17599)
  })
})
