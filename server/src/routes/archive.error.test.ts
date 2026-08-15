import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

// B-2 regression — the archive's error boundary.
//
// Every route in archive.ts reads Postgres and none of them guarded the read. A database
// that was CONFIGURED but UNREACHABLE (embedded Postgres after the machine sleeps, or a
// restart landing mid-request) threw out of the handler, Hono answered a bare 500 with no
// JSON body, the client's getJson() threw, and the home page rendered "Nothing recorded on
// this day" over a day that was fully recorded. An outage was indistinguishable from
// "nothing happened", which is the single most misleading thing this app could say.
//
// These tests pin down BOTH halves of the contract:
//   configured + failing  → 503 archive_unreachable   (the boundary added for B-2)
//   not configured at all → 503 archive_unavailable   (pre-existing, must not regress)
//
// They also prove the mechanism: Hono only applies a sub-app's onError to its handlers when
// the sub-app is mounted with app.route(), which is exactly how index.ts mounts this one.

const failingDb = {
  select: () => {
    throw new Error('Connection terminated unexpectedly')
  },
}

vi.mock('../db/index.js', () => ({
  get db() {
    return dbMock
  },
  pingDb: vi.fn(async () => false),
  closeDb: vi.fn(async () => {}),
}))

vi.mock('../env.js', () => ({
  env: { PORT: '3001', VALVE_API_KEY: 'k', STRATZ_TOKEN: 't' },
  trackedLeagueIds: new Set<number>(),
  isTrackedLeague: () => true,
}))

vi.mock('../services/openDotaApi.js', () => ({
  getTeamMatches: vi.fn(async () => null),
  getTeamPlayers: vi.fn(async () => null),
}))

vi.mock('../services/valveApi.js', () => ({
  getLiveLeagueGames: vi.fn(async () => ({ result: { games: [] } })),
}))

let dbMock: unknown = failingDb

async function call(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  vi.resetModules()
  const mod = await import('./archive.js')
  const app = new Hono()
  app.route('/api', (mod as unknown as { default: Hono }).default)
  const res = await app.request(path)
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

describe('archive routes — error boundary (B-2)', () => {
  beforeEach(() => {
    dbMock = failingDb
  })

  it('answers 503 archive_unreachable when the database throws, not a bare 500', async () => {
    const { status, body } = await call('/api/tournaments')
    expect(status).toBe(503)
    expect(body.error).toBe('archive_unreachable')
  })

  it('covers the calendar window too — the route behind the home page', async () => {
    const { status, body } = await call('/api/schedule/range?from=1000&to=2000')
    expect(status).toBe(503)
    expect(body.error).toBe('archive_unreachable')
  })

  it('still answers 503 archive_unavailable when the archive is simply not configured', async () => {
    dbMock = null
    const { status, body } = await call('/api/tournaments')
    expect(status).toBe(503)
    // The two states stay distinguishable: "switched off" is not "broken".
    expect(body.error).toBe('archive_unavailable')
  })

  it('validates input before touching the database (400 is not swallowed by the boundary)', async () => {
    const { status, body } = await call('/api/matches/not-a-number')
    expect(status).toBe(400)
    expect(body.error).toBe('Invalid matchId')
  })
})
