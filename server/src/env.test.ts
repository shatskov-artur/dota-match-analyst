import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('env module', () => {
  const REQUIRED_VARS = {
    UPSTASH_REDIS_URL: 'rediss://test.upstash.io:6380',
    UPSTASH_REDIS_TOKEN: 'test-token',
    VALVE_API_KEY: 'test-valve-key',
    STRATZ_TOKEN: 'test-stratz-token',  // D-01: required since Phase 6
  }

  beforeEach(() => {
    // Clear the module cache before each test so env.ts re-evaluates
    vi.resetModules()
  })

  afterEach(() => {
    // Restore env after each test (includes STRATZ_TOKEN — added Phase 6)
    for (const key of Object.keys(REQUIRED_VARS)) {
      delete process.env[key]
    }
    delete process.env.PORT
    delete process.env.STRATZ_TOKEN
  })

  it('throws with clear message when UPSTASH_REDIS_URL is missing', async () => {
    process.env.UPSTASH_REDIS_TOKEN = REQUIRED_VARS.UPSTASH_REDIS_TOKEN
    process.env.VALVE_API_KEY = REQUIRED_VARS.VALVE_API_KEY
    process.env.STRATZ_TOKEN = REQUIRED_VARS.STRATZ_TOKEN
    // UPSTASH_REDIS_URL not set

    await expect(import('./env.js')).rejects.toThrow('UPSTASH_REDIS_URL')
  })

  it('throws with clear message when VALVE_API_KEY is missing', async () => {
    process.env.UPSTASH_REDIS_URL = REQUIRED_VARS.UPSTASH_REDIS_URL
    process.env.UPSTASH_REDIS_TOKEN = REQUIRED_VARS.UPSTASH_REDIS_TOKEN
    process.env.STRATZ_TOKEN = REQUIRED_VARS.STRATZ_TOKEN
    // VALVE_API_KEY not set

    await expect(import('./env.js')).rejects.toThrow('VALVE_API_KEY')
  })

  it('exports env object when all required vars are present', async () => {
    process.env.UPSTASH_REDIS_URL = REQUIRED_VARS.UPSTASH_REDIS_URL
    process.env.UPSTASH_REDIS_TOKEN = REQUIRED_VARS.UPSTASH_REDIS_TOKEN
    process.env.VALVE_API_KEY = REQUIRED_VARS.VALVE_API_KEY
    process.env.STRATZ_TOKEN = REQUIRED_VARS.STRATZ_TOKEN

    const { env } = await import('./env.js')

    expect(env.UPSTASH_REDIS_URL).toBe(REQUIRED_VARS.UPSTASH_REDIS_URL)
    expect(env.UPSTASH_REDIS_TOKEN).toBe(REQUIRED_VARS.UPSTASH_REDIS_TOKEN)
    expect(env.VALVE_API_KEY).toBe(REQUIRED_VARS.VALVE_API_KEY)
    expect(env.STRATZ_TOKEN).toBe(REQUIRED_VARS.STRATZ_TOKEN)
  })

  it('defaults PORT to "3001" when PORT is not set', async () => {
    process.env.UPSTASH_REDIS_URL = REQUIRED_VARS.UPSTASH_REDIS_URL
    process.env.UPSTASH_REDIS_TOKEN = REQUIRED_VARS.UPSTASH_REDIS_TOKEN
    process.env.VALVE_API_KEY = REQUIRED_VARS.VALVE_API_KEY
    process.env.STRATZ_TOKEN = REQUIRED_VARS.STRATZ_TOKEN
    delete process.env.PORT

    const { env } = await import('./env.js')

    expect(env.PORT).toBe('3001')
  })

  it('uses custom PORT when PORT is set', async () => {
    process.env.UPSTASH_REDIS_URL = REQUIRED_VARS.UPSTASH_REDIS_URL
    process.env.UPSTASH_REDIS_TOKEN = REQUIRED_VARS.UPSTASH_REDIS_TOKEN
    process.env.VALVE_API_KEY = REQUIRED_VARS.VALVE_API_KEY
    process.env.STRATZ_TOKEN = REQUIRED_VARS.STRATZ_TOKEN
    process.env.PORT = '4000'

    const { env } = await import('./env.js')

    expect(env.PORT).toBe('4000')
  })

  describe('CORS_ORIGIN normalization', () => {
    // A browser never puts a trailing slash in the Origin header, and Hono compares the
    // configured origin verbatim. So a dashboard value of "https://app.vercel.app/" would
    // reject every real request. env.ts strips it rather than rely on the operator.
    const setRequired = () => {
      process.env.UPSTASH_REDIS_URL = REQUIRED_VARS.UPSTASH_REDIS_URL
      process.env.UPSTASH_REDIS_TOKEN = REQUIRED_VARS.UPSTASH_REDIS_TOKEN
      process.env.VALVE_API_KEY = REQUIRED_VARS.VALVE_API_KEY
      process.env.STRATZ_TOKEN = REQUIRED_VARS.STRATZ_TOKEN
    }

    beforeEach(() => {
      delete process.env.CORS_ORIGIN
    })

    afterEach(() => {
      delete process.env.CORS_ORIGIN
    })

    it('strips a trailing slash', async () => {
      setRequired()
      process.env.CORS_ORIGIN = 'https://dota-match-analyst.vercel.app/'

      const { env } = await import('./env.js')

      expect(env.CORS_ORIGIN).toBe('https://dota-match-analyst.vercel.app')
    })

    it('leaves a slash-free origin untouched', async () => {
      setRequired()
      process.env.CORS_ORIGIN = 'https://dota-match-analyst.vercel.app'

      const { env } = await import('./env.js')

      expect(env.CORS_ORIGIN).toBe('https://dota-match-analyst.vercel.app')
    })

    it('trims whitespace and strips repeated trailing slashes', async () => {
      setRequired()
      process.env.CORS_ORIGIN = '  https://dota-match-analyst.vercel.app//  '

      const { env } = await import('./env.js')

      expect(env.CORS_ORIGIN).toBe('https://dota-match-analyst.vercel.app')
    })

    it('stays undefined when unset so the localhost dev fallback applies', async () => {
      setRequired()

      const { env } = await import('./env.js')

      expect(env.CORS_ORIGIN).toBeUndefined()
    })
  })
})
