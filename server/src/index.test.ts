import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest'

// Capture the close mock that the mocked serve() returns so we can assert on it.
const closeMock = vi.fn((cb?: () => void) => {
  cb?.()
})

vi.mock('@hono/node-server', () => ({
  serve: vi.fn(() => ({ close: closeMock })),
}))

// v2.0: the background tick is ingestJob (it subsumes the Phase 10.1 history sampler).
vi.mock('./services/ingest/ingestJob.js', () => ({
  startIngest: vi.fn(),
  stopIngest: vi.fn().mockResolvedValue(undefined),
  runOnce: vi.fn(),
}))

vi.mock('./db/index.js', () => ({
  db: null,
  closeDb: vi.fn().mockResolvedValue(undefined),
  pingDb: vi.fn().mockResolvedValue(false),
}))

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  briefError: (err: unknown) => String(err),
}))

// index.ts closes Redis during shutdown. Importing the real module would open a socket.
const closeRedisMock = vi.fn().mockResolvedValue(undefined)
vi.mock('./cache.js', () => ({
  closeRedis: closeRedisMock,
  redis: null,
}))

// Bypass env validation + route module chains (which would otherwise load
// valveApi/openDotaApi/stratzApi and pull in env at module init).
vi.mock('./env.js', () => ({
  env: {
    PORT: '3001',
    UPSTASH_REDIS_URL: 'http://localhost',
    UPSTASH_REDIS_TOKEN: 'token',
    VALVE_API_KEY: 'key',
    STRATZ_TOKEN: 'token',
  },
  trackedLeagueIds: new Set<number>(),
  isTrackedLeague: () => true,
}))

vi.mock('./routes/live.js', async () => {
  const { Hono } = await import('hono')
  return { default: new Hono() }
})
vi.mock('./routes/heroes.js', async () => {
  const { Hono } = await import('hono')
  return { default: new Hono() }
})
vi.mock('./routes/archive.js', async () => {
  const { Hono } = await import('hono')
  return { default: new Hono() }
})

// Avoid killing the test runner via process.exit inside the shutdown helper.
const exitSpy = vi
  .spyOn(process, 'exit')
  .mockImplementation((() => undefined) as never)

import { startIngest, stopIngest } from './services/ingest/ingestJob.js'
import { closeDb } from './db/index.js'

let app: typeof import('./index.js').default
let resetShutdownState: () => void

beforeAll(async () => {
  // Importing index.ts runs startIngest() and registers the SIGTERM/SIGINT
  // handlers at top level. Do this once for the whole suite.
  const mod = await import('./index.js')
  app = mod.default
  resetShutdownState = mod.__resetShutdownState
})

afterEach(() => {
  vi.mocked(stopIngest).mockClear()
  vi.mocked(closeDb).mockClear()
  closeRedisMock.mockClear()
  closeMock.mockClear()
  exitSpy.mockClear()
  // shutdown() is once-only in production — a second signal must not re-run the teardown.
  // Each test drives it from scratch, so the guard is cleared between them.
  resetShutdownState()
})

afterAll(() => {
  process.removeAllListeners('SIGTERM')
  process.removeAllListeners('SIGINT')
  exitSpy.mockRestore()
})

describe('server bootstrap lifecycle', () => {
  it('calls startIngest() during boot', () => {
    expect(startIngest).toHaveBeenCalledTimes(1)
  })

  /** Lets the async shutdown helper advance past every await in its body. */
  const drainShutdown = async () => {
    for (let i = 0; i < 6; i++) {
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
  }

  it('SIGTERM stops the listener, then drains ingest, the db pool and Redis', async () => {
    process.emit('SIGTERM')
    await drainShutdown()
    expect(closeMock).toHaveBeenCalledTimes(1)
    expect(stopIngest).toHaveBeenCalledTimes(1)
    expect(closeDb).toHaveBeenCalledTimes(1)
    expect(closeRedisMock).toHaveBeenCalledTimes(1)
  })

  it('closes the http listener BEFORE the db pool', async () => {
    // The original order tore the pool down first, so requests still in flight during the
    // drain window hit a dead pool and were answered 503 on every deploy.
    const order: string[] = []
    closeMock.mockImplementationOnce((cb?: () => void) => {
      order.push('http')
      cb?.()
    })
    vi.mocked(closeDb).mockImplementationOnce(async () => {
      order.push('db')
    })

    process.emit('SIGTERM')
    await drainShutdown()

    expect(order).toEqual(['http', 'db'])
  })

  it('ignores a second signal instead of running the teardown twice', async () => {
    process.emit('SIGTERM')
    process.emit('SIGINT')
    await drainShutdown()
    expect(stopIngest).toHaveBeenCalledTimes(1)
    expect(closeMock).toHaveBeenCalledTimes(1)
  })

  it('SIGINT drains stopIngest() then closes the http server', async () => {
    process.emit('SIGINT')
    await drainShutdown()
    expect(stopIngest).toHaveBeenCalledTimes(1)
    expect(closeMock).toHaveBeenCalledTimes(1)
  })
})

describe('GET /api/health', () => {
  it('reports archive as not_configured when DATABASE_URL is absent', async () => {
    // db is mocked to null — the shape a deploy has when it never got DATABASE_URL.
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)

    const body = (await res.json()) as { status: string; archive: string }
    expect(body.status).toBe('ok')
    // The whole point of the field: green liveness must not imply a working archive.
    expect(body.archive).toBe('not_configured')
  })
})
