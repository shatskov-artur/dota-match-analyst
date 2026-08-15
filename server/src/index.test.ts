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
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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

beforeAll(async () => {
  // Importing index.ts runs startIngest() and registers the SIGTERM/SIGINT
  // handlers at top level. Do this once for the whole suite.
  await import('./index.js')
})

afterEach(() => {
  vi.mocked(stopIngest).mockClear()
  vi.mocked(closeDb).mockClear()
  closeMock.mockClear()
  exitSpy.mockClear()
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

  it('SIGTERM drains stopIngest(), closes the db pool, then the http server', async () => {
    process.emit('SIGTERM')
    // Allow the async shutdown helper to advance past both awaits.
    await new Promise<void>((resolve) => setImmediate(resolve))
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(stopIngest).toHaveBeenCalledTimes(1)
    expect(closeDb).toHaveBeenCalledTimes(1)
    expect(closeMock).toHaveBeenCalledTimes(1)
  })

  it('SIGINT drains stopIngest() then closes the http server', async () => {
    process.emit('SIGINT')
    await new Promise<void>((resolve) => setImmediate(resolve))
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(stopIngest).toHaveBeenCalledTimes(1)
    expect(closeMock).toHaveBeenCalledTimes(1)
  })
})
