import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 10 Plan 01 — Unit tests for historySampler.
//
// Mocks:
//   '../cache.js' — redis with vi.fn() stubs for set/rpush/ltrim/expire/lrange/del/get
//   '../logger.js' — pino logger replaced with { info, error } vi.fn() stubs

vi.mock('../cache.js', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    rpush: vi.fn(),
    ltrim: vi.fn(),
    expire: vi.fn(),
    lrange: vi.fn(),
    del: vi.fn(),
  },
}))

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

import {
  buildSample,
  tryWriteSample,
  readHistory,
  deleteHistory,
} from './historySampler.js'
import { redis } from '../cache.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildSample — pure aggregator (D-07, D-08, D-15..D-18)', () => {
  it('returns null when game_state !== 5 (D-08)', () => {
    expect(
      buildSample({ game_state: 2, duration: 600 }),
    ).toBeNull()
  })

  it('returns null when duration is 0 (D-08)', () => {
    expect(buildSample({ game_state: 5, duration: 0 })).toBeNull()
  })

  it('falls back to scoreboard.duration when top-level duration is missing', () => {
    const result = buildSample({
      game_state: 5,
      scoreboard: {
        duration: 600,
        radiant: { players: [{ net_worth: 1000, xpm: 500 }] },
        dire: { players: [{ net_worth: 800, xpm: 450 }] },
      },
    })
    expect(result).not.toBeNull()
    expect(result!.t).toBe(600)
  })

  it('returns null when either team players array is empty', () => {
    const result = buildSample({
      game_state: 5,
      duration: 600,
      scoreboard: {
        radiant: { players: [] },
        dire: { players: [{ net_worth: 800, xpm: 450 }] },
      },
    })
    expect(result).toBeNull()
  })

  it('returns null when scoreboard is missing entirely', () => {
    expect(buildSample({ game_state: 5, duration: 600 })).toBeNull()
  })

  it('computes Radiant-positive gold diff from net_worth sums', () => {
    const result = buildSample({
      game_state: 5,
      duration: 600,
      scoreboard: {
        radiant: {
          players: [
            { net_worth: 1000, xpm: 500 },
            { net_worth: 1500, xpm: 500 },
            { net_worth: 800, xpm: 500 },
            { net_worth: 900, xpm: 500 },
            { net_worth: 800, xpm: 500 },
          ],
        },
        dire: {
          players: [
            { net_worth: 600, xpm: 500 },
            { net_worth: 700, xpm: 500 },
            { net_worth: 500, xpm: 500 },
            { net_worth: 600, xpm: 500 },
            { net_worth: 600, xpm: 500 },
          ],
        },
      },
    })
    expect(result).not.toBeNull()
    // R = 5000, D = 3000 → 2000 (Radiant-positive)
    expect(result!.gold).toBe(2000)
  })

  it('computes Dire-leading gold diff as a negative number', () => {
    const result = buildSample({
      game_state: 5,
      duration: 600,
      scoreboard: {
        radiant: {
          players: [{ net_worth: 100, xpm: 0 }],
        },
        dire: {
          players: [{ net_worth: 500, xpm: 0 }],
        },
      },
    })
    expect(result!.gold).toBe(-400)
  })

  it('computes XP diff via xpm * duration / 60 and rounds (D-15, D-16)', () => {
    // duration=600 → factor 10. Radiant total xpm 1000 → 10_000 xp.
    // Dire total xpm 600 → 6_000 xp. Diff = +4000.
    const result = buildSample({
      game_state: 5,
      duration: 600,
      scoreboard: {
        radiant: { players: [{ net_worth: 0, xpm: 1000 }] },
        dire: { players: [{ net_worth: 0, xpm: 600 }] },
      },
    })
    expect(result!.xp).toBe(4000)
  })

  it('treats missing xpm as 0 (D-18) — no NaN, no throw', () => {
    const result = buildSample({
      game_state: 5,
      duration: 600,
      scoreboard: {
        radiant: {
          players: [
            { net_worth: 1000 }, // missing xpm → contributes 0
            { net_worth: 1000, xpm: 600 },
          ],
        },
        dire: {
          players: [{ net_worth: 0, xpm: 0 }],
        },
      },
    })
    expect(result).not.toBeNull()
    expect(Number.isFinite(result!.xp)).toBe(true)
    expect(Number.isNaN(result!.xp)).toBe(false)
    // teamXpR = 0 + (600 * 600 / 60) = 6000
    expect(result!.xp).toBe(6000)
  })

  it('consumes Valve canonical field name xp_per_min (UAT-XP-01)', () => {
    // Raw Valve scoreboard ships xp_per_min, not xpm — see server/src/routes/live.ts:89.
    // duration=600 → factor 10. Radiant total xp_per_min 1000 → 10_000 xp.
    // Dire total xp_per_min 600 → 6_000 xp. Diff = +4000 (Radiant-positive).
    const result = buildSample({
      game_state: 5,
      duration: 600,
      scoreboard: {
        radiant: { players: [{ net_worth: 0, xp_per_min: 1000 }] },
        dire:    { players: [{ net_worth: 0, xp_per_min: 600 }] },
      },
    } as never)
    expect(result).not.toBeNull()
    expect(result!.xp).toBe(4000)
  })

  it('treats NaN / Infinity xp_per_min as 0 (defensive hardening)', () => {
    // Number.isFinite guard prevents NaN propagation into the chart.
    const result = buildSample({
      game_state: 5,
      duration: 600,
      scoreboard: {
        radiant: {
          players: [
            { net_worth: 0, xp_per_min: Number.NaN },
            { net_worth: 0, xp_per_min: 600 },
          ],
        },
        dire: {
          players: [{ net_worth: 0, xp_per_min: Number.POSITIVE_INFINITY }],
        },
      },
    } as never)
    expect(result).not.toBeNull()
    expect(Number.isFinite(result!.xp)).toBe(true)
    expect(Number.isNaN(result!.xp)).toBe(false)
    // Radiant: 0 + (600 * 600 / 60) = 6000. Dire: NaN/Inf → 0. Diff = +6000.
    expect(result!.xp).toBe(6000)
  })

  it('t equals floor(duration) (D-07)', () => {
    const result = buildSample({
      game_state: 5,
      duration: 600.7,
      scoreboard: {
        radiant: { players: [{ net_worth: 0, xpm: 0 }] },
        dire: { players: [{ net_worth: 0, xpm: 0 }] },
      },
    })
    expect(result!.t).toBe(600)
  })
})

describe('tryWriteSample — Redis throttle + cap (D-06, D-09, D-10, D-11, D-12)', () => {
  const sample = { t: 600, gold: 2000, xp: 4000 }

  it('returns false when NX gate is held (set returns null)', async () => {
    vi.mocked(redis!.set).mockResolvedValue(null)
    const result = await tryWriteSample(123, sample)
    expect(result).toBe(false)
    expect(redis!.rpush).not.toHaveBeenCalled()
    expect(redis!.ltrim).not.toHaveBeenCalled()
    expect(redis!.expire).not.toHaveBeenCalled()
  })

  it('on gate acquire, calls RPUSH then LTRIM(-240, -1) then EXPIRE(7200) in order', async () => {
    vi.mocked(redis!.set).mockResolvedValue('OK')
    vi.mocked(redis!.rpush).mockResolvedValue(1)
    vi.mocked(redis!.ltrim).mockResolvedValue('OK')
    vi.mocked(redis!.expire).mockResolvedValue(1)

    const result = await tryWriteSample(123, sample)
    expect(result).toBe(true)

    expect(redis!.rpush).toHaveBeenCalledWith(
      'timeseries:123',
      JSON.stringify(sample),
    )
    expect(redis!.ltrim).toHaveBeenCalledWith('timeseries:123', -240, -1)
    expect(redis!.expire).toHaveBeenCalledWith('timeseries:123', 7200)

    const rpushOrder = vi.mocked(redis!.rpush).mock.invocationCallOrder[0]
    const ltrimOrder = vi.mocked(redis!.ltrim).mock.invocationCallOrder[0]
    const expireOrder = vi.mocked(redis!.expire).mock.invocationCallOrder[0]
    expect(rpushOrder).toBeLessThan(ltrimOrder)
    expect(ltrimOrder).toBeLessThan(expireOrder)
  })

  it('NX set call uses 5s EX with NX flag', async () => {
    vi.mocked(redis!.set).mockResolvedValue('OK')
    vi.mocked(redis!.rpush).mockResolvedValue(1)
    vi.mocked(redis!.ltrim).mockResolvedValue('OK')
    vi.mocked(redis!.expire).mockResolvedValue(1)

    await tryWriteSample(123, sample)
    expect(redis!.set).toHaveBeenCalledWith(
      'lastSample:123',
      '1',
      'EX',
      5,
      'NX',
    )
  })

  it('returns false silently when redis throws (D-09)', async () => {
    vi.mocked(redis!.set).mockResolvedValue('OK')
    vi.mocked(redis!.rpush).mockRejectedValue(new Error('boom'))

    await expect(tryWriteSample(123, sample)).resolves.toBe(false)
  })
})

describe('readHistory', () => {
  it('LRANGE 0 -1 then JSON.parse each entry', async () => {
    vi.mocked(redis!.lrange).mockResolvedValue([
      '{"t":60,"gold":100,"xp":50}',
      '{"t":90,"gold":200,"xp":80}',
    ])
    const result = await readHistory(123)
    expect(redis!.lrange).toHaveBeenCalledWith('timeseries:123', 0, -1)
    expect(result).toEqual([
      { t: 60, gold: 100, xp: 50 },
      { t: 90, gold: 200, xp: 80 },
    ])
  })

  it('returns [] when redis throws', async () => {
    vi.mocked(redis!.lrange).mockRejectedValue(new Error('x'))
    await expect(readHistory(123)).resolves.toEqual([])
  })
})

describe('deleteHistory (D-13)', () => {
  it('DELs both timeseries and lastSample keys', async () => {
    vi.mocked(redis!.del).mockResolvedValue(2)
    await deleteHistory(123)
    expect(redis!.del).toHaveBeenCalledWith(
      'timeseries:123',
      'lastSample:123',
    )
  })

  it('swallows redis errors silently', async () => {
    vi.mocked(redis!.del).mockRejectedValue(new Error('boom'))
    await expect(deleteHistory(123)).resolves.toBeUndefined()
  })
})
