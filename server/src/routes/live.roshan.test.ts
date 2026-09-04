import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

// Phase 9 Plan 09-01 Wave 0 — RED integration tests for /api/live/games match.roshan.
// Until plan 04 wires the route + schemas + service this suite is RED:
//   - response.games[N].roshan does not yet exist (current code returns roshan_respawn_timer at top level)
//   - schema parsing of roshan_respawn_timer is asserted (proves plan 03 schema work)
// Drives D-01..D-09, ROSH-01, ROSH-02, ROSH-04.

// In-memory redis backing store — shared across calls within a single test
// so writes by call N are visible to reads by call N+1 (D-08 persistence).
const redisStore = new Map<string, string>()

/** Lists backing the history sampler's RPUSH/LRANGE, alongside the key/value store. */
const redisLists = new Map<string, string[]>()

vi.mock('../cache.js', async () => {
  return {
    // A COMPLETE fake, which it was not.
    //
    // The mock used to expose only get/set, so every call the history sampler makes —
    // rpush, lrange, ltrim, expire, del — threw "is not a function". The sampler swallows
    // its own errors by design (it must never break a live response), so the suite stayed
    // green while the entire history path inside it did nothing. Sixty lines of stderr per
    // run said so and nobody had to care, which is the definition of a test that lies.
    redis: {
      get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
      set: vi.fn(async (key: string, value: string, ..._rest: unknown[]) => {
        // The sampler's 5s NX gate: `set(key, '1', 'EX', n, 'NX')` must return null when
        // the key already exists, which is what throttles it to one sample per window.
        if (_rest.includes('NX') && redisStore.has(key)) return null
        redisStore.set(key, value)
        return 'OK'
      }),
      rpush: vi.fn(async (key: string, ...values: string[]) => {
        const list = redisLists.get(key) ?? []
        list.push(...values)
        redisLists.set(key, list)
        return list.length
      }),
      lrange: vi.fn(async (key: string, start: number, stop: number) => {
        const list = redisLists.get(key) ?? []
        // Redis semantics: inclusive, and -1 means "to the end".
        return list.slice(start, stop === -1 ? undefined : stop + 1)
      }),
      ltrim: vi.fn(async (key: string, start: number, stop: number) => {
        const list = redisLists.get(key) ?? []
        redisLists.set(key, list.slice(start < 0 ? Math.max(0, list.length + start) : start, stop === -1 ? undefined : stop + 1))
        return 'OK'
      }),
      expire: vi.fn(async () => 1),
      del: vi.fn(async (...keys: string[]) => {
        let n = 0
        for (const k of keys) {
          if (redisStore.delete(k)) n++
          if (redisLists.delete(k)) n++
        }
        return n
      }),
    },
    cached: vi.fn(async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn()),
    TTL: { LIVE_MATCH: 30, DRAFT: 4, HERO_STATS: 21_600, PLAYER_STATS: 900, WIN_PROB: 60 },
  }
})

vi.mock('../services/openDotaApi.js', () => ({
  getLeagueName: vi.fn(async () => 'Test League'),
  getLeagueInfo: vi.fn(async () => ({ name: 'Test League', tier: 'premium' })),
  getPlayerHeroes: vi.fn(async () => []),
}))

// The live path now falls back to the archive for the Roshan kill history when Redis is
// cold (a server restart mid-match used to reset the counter to 1, which picks the wrong
// loot table). These cases exercise the Redis path, so the archive answers "I have
// nothing" — exactly what it did before the fallback existed.
vi.mock('../services/archive/roshanHistory.js', () => ({
  recoverRoshanState: vi.fn(async () => null),
}))

// /games filters ladder traffic out of the response and asks env which leagues are tracked,
// so env is now a direct dependency of the route rather than something the mocks below could
// keep out by proxy. Stubbed rather than satisfied with real variables: this suite is about
// Roshan state, and no test here turns on which leagues an operator happens to record.
vi.mock('../env.js', () => ({
  env: { PORT: '3001', VALVE_API_KEY: 'k', STRATZ_TOKEN: 't' },
  trackedLeagueIds: new Set<number>(),
  isTrackedLeague: () => false,
}))

// Team-logo enrichment is orthogonal to Roshan state; mocked so this suite does not pull in
// env.js (which validates VALVE_API_KEY at import time) through the real teamLogo service.
vi.mock('../services/teamLogo.js', () => ({
  teamRef: vi.fn((team?: { team_id?: number }) =>
    team?.team_id ? { key: `team-logo:${team.team_id}`, teamId: team.team_id } : null,
  ),
  peekTeamLogo: vi.fn(async () => undefined),
  warmTeamLogo: vi.fn(),
}))

vi.mock('../services/intel.js', () => ({
  applyKnownToPlay: vi.fn((g) => g),
  rankCountersStratz: vi.fn(async () => []),
}))

vi.mock('../services/stratzApi.js', () => ({
  getWinProbability: vi.fn(async () => null),
  getHeroMatchupsStratz: vi.fn(async () => null),
}))

let scoreboardRoshanTimer = 0
let currentMatchId = 999

vi.mock('../services/valveApi.js', () => ({
  getLiveLeagueGames: vi.fn(async () => ({
    result: {
      games: [
        {
          match_id: currentMatchId,
          league_id: 1,
          radiant_team: { team_id: 1, team_name: 'R' },
          dire_team: { team_id: 2, team_name: 'D' },
          players: [],
          scoreboard: {
            duration: 600,
            roshan_respawn_timer: scoreboardRoshanTimer,
            radiant: { players: [{ account_id: 1 }] },
            dire: { players: [{ account_id: 2 }] },
          },
        },
      ],
    },
  })),
  getLiveLeagueGamesFast: vi.fn(),
}))

let liveRoutes: Hono
beforeEach(async () => {
  redisStore.clear()
  redisLists.clear()
  scoreboardRoshanTimer = 0
  currentMatchId = 999
  vi.resetModules()
  const mod = await import('./live.js')
  liveRoutes = (mod as unknown as { default: Hono }).default
})

async function callGames(): Promise<{ games: Array<Record<string, unknown>> }> {
  const app = new Hono()
  app.route('/api/live', liveRoutes)
  const res = await app.request('/api/live/games')
  return (await res.json()) as { games: Array<Record<string, unknown>> }
}

describe('/api/live/games — match.roshan field (Phase 9)', () => {
  it('first call with roshan_respawn_timer=0 → roshan.killCount=0, alive', async () => {
    scoreboardRoshanTimer = 0
    const body = await callGames()
    const roshan = body.games[0].roshan as Record<string, unknown> | null
    expect(roshan).not.toBeNull()
    expect((roshan as Record<string, unknown>).killCount).toBe(0)
    expect((roshan as Record<string, unknown>).alive).toBe(true)
  })

  it('transition 0→480 on second call → killCount=1, alive=false, lastKillLoot=[117]', async () => {
    scoreboardRoshanTimer = 0
    await callGames()
    scoreboardRoshanTimer = 480
    const body = await callGames()
    const roshan = body.games[0].roshan as Record<string, unknown>
    expect(roshan.killCount).toBe(1)
    expect(roshan.alive).toBe(false)
    expect(roshan.respawnIn).toBe(480)
    expect(roshan.lastKillLoot).toEqual([117])
  })

  it('respawn (480→0) → killCount stays 1, alive=true, respawnIn=null', async () => {
    scoreboardRoshanTimer = 0
    await callGames()
    scoreboardRoshanTimer = 480
    await callGames()
    scoreboardRoshanTimer = 0
    const body = await callGames()
    const roshan = body.games[0].roshan as Record<string, unknown>
    expect(roshan.killCount).toBe(1)
    expect(roshan.alive).toBe(true)
    expect(roshan.respawnIn).toBeNull()
  })

  it('second kill (0→480 again) → killCount=2, lastKillLoot=[117,1804]', async () => {
    scoreboardRoshanTimer = 0
    await callGames()
    scoreboardRoshanTimer = 480
    await callGames()
    scoreboardRoshanTimer = 0
    await callGames()
    scoreboardRoshanTimer = 480
    const body = await callGames()
    const roshan = body.games[0].roshan as Record<string, unknown>
    expect(roshan.killCount).toBe(2)
    expect(roshan.lastKillLoot).toEqual([117, 1804])
  })

  it('schema parses roshan_respawn_timer:480 without throwing (plan 03 schema work)', async () => {
    scoreboardRoshanTimer = 480
    await expect(callGames()).resolves.toBeDefined()
  })

  it('different match_id (888) does not inherit state from 999 (ROSH-04)', async () => {
    currentMatchId = 999
    scoreboardRoshanTimer = 0
    await callGames()
    scoreboardRoshanTimer = 480
    await callGames()
    currentMatchId = 888
    scoreboardRoshanTimer = 0
    const body = await callGames()
    const roshan = body.games[0].roshan as Record<string, unknown>
    expect(roshan.killCount).toBe(0)
    expect(roshan.alive).toBe(true)
  })
})

// ─── J-1 regression: the mock must exercise the code, not hide it ────────────────────
//
// Until the Redis fake grew rpush/lrange/ltrim/expire/del, every history call inside this
// route threw "is not a function". The sampler swallows its own errors on purpose — it may
// never break a live response — so the suite passed while the whole history path did
// nothing at all, announcing it only in stderr. These assertions make that impossible to
// repeat: if the list operations go missing again, `history` comes back empty and fails.
describe('/api/live/games — the history sampler actually runs (J-1)', () => {
  it('returns the sampled gold/XP series it just wrote', async () => {
    const body = await callGames()
    const history = body.games[0].history as Array<Record<string, number>>
    expect(Array.isArray(history)).toBe(true)
    expect(history.length).toBeGreaterThan(0)
    expect(history[0]).toHaveProperty('t')
    expect(history[0]).toHaveProperty('gold')
    expect(history[0]).toHaveProperty('xp')
  })

  it('keeps the series per match rather than pooling it', async () => {
    currentMatchId = 999
    await callGames()
    currentMatchId = 888
    const body = await callGames()
    const history = body.games[0].history as unknown[]
    // 888 has been sampled exactly once, no matter how much 999 accumulated.
    expect(history).toHaveLength(1)
  })
})
