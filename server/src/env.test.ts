import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('env module', () => {
  const REQUIRED_VARS = {
    UPSTASH_REDIS_URL: 'rediss://test.upstash.io:6380',
    UPSTASH_REDIS_TOKEN: 'test-token',
    VALVE_API_KEY: 'test-valve-key',
  }

  beforeEach(() => {
    // Clear the module cache before each test so env.ts re-evaluates
    vi.resetModules()
  })

  afterEach(() => {
    // Restore env after each test
    for (const key of Object.keys(REQUIRED_VARS)) {
      delete process.env[key]
    }
    delete process.env.PORT
  })

  it('throws with clear message when UPSTASH_REDIS_URL is missing', async () => {
    process.env.UPSTASH_REDIS_TOKEN = REQUIRED_VARS.UPSTASH_REDIS_TOKEN
    process.env.VALVE_API_KEY = REQUIRED_VARS.VALVE_API_KEY
    // UPSTASH_REDIS_URL not set

    await expect(import('./env.js')).rejects.toThrow('UPSTASH_REDIS_URL')
  })

  it('throws with clear message when VALVE_API_KEY is missing', async () => {
    process.env.UPSTASH_REDIS_URL = REQUIRED_VARS.UPSTASH_REDIS_URL
    process.env.UPSTASH_REDIS_TOKEN = REQUIRED_VARS.UPSTASH_REDIS_TOKEN
    // VALVE_API_KEY not set

    await expect(import('./env.js')).rejects.toThrow('VALVE_API_KEY')
  })

  it('exports env object when all required vars are present', async () => {
    process.env.UPSTASH_REDIS_URL = REQUIRED_VARS.UPSTASH_REDIS_URL
    process.env.UPSTASH_REDIS_TOKEN = REQUIRED_VARS.UPSTASH_REDIS_TOKEN
    process.env.VALVE_API_KEY = REQUIRED_VARS.VALVE_API_KEY

    const { env } = await import('./env.js')

    expect(env.UPSTASH_REDIS_URL).toBe(REQUIRED_VARS.UPSTASH_REDIS_URL)
    expect(env.UPSTASH_REDIS_TOKEN).toBe(REQUIRED_VARS.UPSTASH_REDIS_TOKEN)
    expect(env.VALVE_API_KEY).toBe(REQUIRED_VARS.VALVE_API_KEY)
  })

  it('defaults PORT to "3001" when PORT is not set', async () => {
    process.env.UPSTASH_REDIS_URL = REQUIRED_VARS.UPSTASH_REDIS_URL
    process.env.UPSTASH_REDIS_TOKEN = REQUIRED_VARS.UPSTASH_REDIS_TOKEN
    process.env.VALVE_API_KEY = REQUIRED_VARS.VALVE_API_KEY
    delete process.env.PORT

    const { env } = await import('./env.js')

    expect(env.PORT).toBe('3001')
  })

  it('uses custom PORT when PORT is set', async () => {
    process.env.UPSTASH_REDIS_URL = REQUIRED_VARS.UPSTASH_REDIS_URL
    process.env.UPSTASH_REDIS_TOKEN = REQUIRED_VARS.UPSTASH_REDIS_TOKEN
    process.env.VALVE_API_KEY = REQUIRED_VARS.VALVE_API_KEY
    process.env.PORT = '4000'

    const { env } = await import('./env.js')

    expect(env.PORT).toBe('4000')
  })
})
