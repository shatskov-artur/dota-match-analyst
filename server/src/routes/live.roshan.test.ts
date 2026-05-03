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

vi.mock('../cache.js', async () => {
  return {
    redis: {
      get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        redisStore.set(key, value)
        return 'OK'
      }),
    },
    cached: vi.fn(async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn()),
    TTL: { LIVE_MATCH: 30, DRAFT: 4, HERO_STATS: 21_600, PLAYER_STATS: 900, WIN_PROB: 60 },
  }
})

vi.mock('../services/openDotaApi.js', () => ({
  getLeagueName: vi.fn(async () => 'Test League'),
  getPlayerHeroes: vi.fn(async () => []),
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
