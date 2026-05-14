import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest'

// Capture the close mock that the mocked serve() returns so we can assert on it.
const closeMock = vi.fn((cb?: () => void) => {
  cb?.()
})

vi.mock('@hono/node-server', () => ({
  serve: vi.fn(() => ({ close: closeMock })),
}))

vi.mock('./services/historySamplerJob.js', () => ({
  startSampler: vi.fn(),
  stopSampler: vi.fn().mockResolvedValue(undefined),
  runOnce: vi.fn(),
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
}))

vi.mock('./routes/live.js', async () => {
  const { Hono } = await import('hono')
  return { default: new Hono() }
})
vi.mock('./routes/heroes.js', async () => {
  const { Hono } = await import('hono')
  return { default: new Hono() }
})

// Avoid killing the test runner via process.exit inside the shutdown helper.
const exitSpy = vi
  .spyOn(process, 'exit')
  .mockImplementation((() => undefined) as never)

import { startSampler, stopSampler } from './services/historySamplerJob.js'

beforeAll(async () => {
  // Importing index.ts runs startSampler() and registers the SIGTERM/SIGINT
  // handlers at top level. Do this once for the whole suite.
  await import('./index.js')
})

afterEach(() => {
  vi.mocked(stopSampler).mockClear()
  closeMock.mockClear()
  exitSpy.mockClear()
})

afterAll(() => {
  process.removeAllListeners('SIGTERM')
  process.removeAllListeners('SIGINT')
  exitSpy.mockRestore()
})

describe('server bootstrap lifecycle (Phase 10.1)', () => {
  it('calls startSampler() during boot', () => {
    expect(startSampler).toHaveBeenCalledTimes(1)
  })

  it('SIGTERM drains stopSampler() then closes the http server', async () => {
    process.emit('SIGTERM')
    // Allow the async shutdown helper to advance: await one microtask + the
    // mocked stopSampler resolution.
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(stopSampler).toHaveBeenCalledTimes(1)
    expect(closeMock).toHaveBeenCalledTimes(1)
  })

  it('SIGINT drains stopSampler() then closes the http server', async () => {
    process.emit('SIGINT')
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(stopSampler).toHaveBeenCalledTimes(1)
    expect(closeMock).toHaveBeenCalledTimes(1)
  })
})
