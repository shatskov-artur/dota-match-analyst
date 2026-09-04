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

// Bad input used to be indistinguishable from an outage.
//
// `Math.min(Number(q) || 500, 800)` defends against NaN and zero and nothing else, so a
// negative limit reached Postgres as `LIMIT -4` and a huge `t` overflowed an int4 column.
// Both threw, both hit the boundary above, and both told the user the archive was down
// while the database was healthy and had simply been handed nonsense.
//
// These run against the FAILING db mock on purpose: if validation ever stops happening
// first, the request reaches the mock, throws, and the assertion sees 503 instead of 400.
describe('archive routes — input validation precedes the database', () => {
  beforeEach(() => {
    dbMock = failingDb
  })

  it('rejects a negative limit with 400, not a 503 about the archive', async () => {
    const { status } = await call('/api/schedule/range?from=1000&to=2000&limit=-5')
    expect(status).toBe(400)
  })

  it('rejects a non-integer limit', async () => {
    const { status } = await call('/api/matches?limit=2.5')
    expect(status).toBe(400)
  })

  it('rejects an unknown status instead of silently answering a different question', async () => {
    const { status } = await call('/api/matches?status=lve')
    expect(status).toBe(400)
  })

  it('rejects a t beyond what an int4 column can hold', async () => {
    const { status } = await call('/api/matches/8942152024/at?t=99999999999')
    expect(status).toBe(400)
  })

  it('rejects a negative minute', async () => {
    const { status } = await call('/api/matches/8942152024/at?minute=-1')
    expect(status).toBe(400)
  })

  it('rejects a fractional node id', async () => {
    const { status } = await call('/api/tournaments/19719/nodes/1.5')
    expect(status).toBe(400)
  })

  it('still accepts a limit within range', async () => {
    // Reaches the (failing) database, proving the guard did not simply reject everything.
    const { status } = await call('/api/matches?limit=10')
    expect(status).toBe(503)
  })
})

describe('archive routes — a real fault is not disguised as an outage', () => {
  it('answers 500 when the failure is not a connection problem', async () => {
    // A bug in a handler, or a query the driver rejects, used to be reported as
    // "archive_unreachable" — the one status an operator ignores during an outage.
    dbMock = {
      select: () => {
        throw new TypeError('cannot read properties of undefined')
      },
    }
    const { status, body } = await call('/api/tournaments')
    expect(status).toBe(500)
    expect(body.error).toBe('internal_error')
  })
})
