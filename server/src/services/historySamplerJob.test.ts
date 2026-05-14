import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Phase 10.1 Plan 01 (Wave 1) — RED Validation Architecture tests for the
// background history sampler job. Tests are written FIRST against the empty
// skeleton (historySamplerJob.ts). Wave 2 (Plan 02) fills the bodies and turns
// these green.
//
// Mocks (hoisted by vi.mock BEFORE SUT import):
//   './valveApi.js'       — getLiveLeagueGames vi.fn()
//   './historySampler.js' — buildSample, tryWriteSample, deleteHistory vi.fn()
//   '../logger.js'        — pino logger replaced with { info, warn, error } vi.fn()

vi.mock('./valveApi.js', () => ({
  getLiveLeagueGames: vi.fn(),
}))

vi.mock('./historySampler.js', () => ({
  buildSample: vi.fn(),
  tryWriteSample: vi.fn(),
  deleteHistory: vi.fn(),
}))

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  runOnce,
  startSampler,
  stopSampler,
  INTERVAL_MS,
} from './historySamplerJob.js'
import { getLiveLeagueGames } from './valveApi.js'
import {
  buildSample,
  tryWriteSample,
  deleteHistory,
} from './historySampler.js'
import { logger } from '../logger.js'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

// Game fixture mirroring routes/live.ts derivedGameState inference:
//   derivedState 5 → scoreboard.radiant.players[] non-empty (game in progress)
//   derivedState 6 → explicit game_state: 6 (finished)
function gameFixture(matchId: number, derivedState: 5 | 6) {
  if (derivedState === 6) {
    return {
      match_id: matchId,
      game_state: 6,
      scoreboard: { radiant: { players: [] }, dire: { players: [] } },
    }
  }
  return {
    match_id: matchId,
    // game_state omitted on purpose so derivedGameState comes from
    // scoreboard.radiant.players[] presence
    scoreboard: {
      duration: 600,
      radiant: { players: [{ net_worth: 1000, xpm: 500 }] },
      dire: { players: [{ net_worth: 800, xpm: 450 }] },
    },
  }
}

describe('runOnce — Validation Architecture (D-04, D-05, D-06, D-09, D-13)', () => {
  it('Test 1 — fan-out: writes for state=5 matches, deletes for state=6 (D-04, D-13)', async () => {
    vi.mocked(getLiveLeagueGames).mockResolvedValue({
      result: {
        games: [gameFixture(1, 5), gameFixture(2, 5), gameFixture(3, 6)],
      },
    } as never)
    vi.mocked(buildSample).mockReturnValue({ t: 600, gold: 0, xp: 0 })
    vi.mocked(tryWriteSample).mockResolvedValue(true)
    vi.mocked(deleteHistory).mockResolvedValue(undefined)

    await runOnce()

    expect(tryWriteSample).toHaveBeenCalledTimes(2)
    expect(tryWriteSample).toHaveBeenCalledWith(1, expect.any(Object))
    expect(tryWriteSample).toHaveBeenCalledWith(2, expect.any(Object))
    expect(deleteHistory).toHaveBeenCalledTimes(1)
    expect(deleteHistory).toHaveBeenCalledWith(3)
  })

  it('Test 2 — per-match isolation: one rejection does not block others (D-04, D-06)', async () => {
    vi.mocked(getLiveLeagueGames).mockResolvedValue({
      result: { games: [gameFixture(1, 5), gameFixture(2, 5)] },
    } as never)
    vi.mocked(buildSample).mockReturnValue({ t: 600, gold: 0, xp: 0 })
    vi.mocked(tryWriteSample)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(true)

    await expect(runOnce()).resolves.toBeUndefined()

    expect(tryWriteSample).toHaveBeenCalledTimes(2)
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ matchId: 1 }),
      'history sampler match failed',
    )
  })

  it('Test 3 — skip-if-running: overlapping ticks log warn and do not re-fan-out (D-05)', async () => {
    vi.useFakeTimers()
    // never resolves — keeps the first tick in-flight across subsequent intervals
    vi.mocked(getLiveLeagueGames).mockImplementation(
      () => new Promise(() => {}),
    )

    startSampler()
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2)

    expect(getLiveLeagueGames).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ inFlightAgeMs: expect.any(Number) }),
      'history sampler tick overlap, skipping',
    )

    // Cleanup: do NOT await stopSampler — the in-flight promise never resolves.
    // afterEach restores real timers. Each test file owns its own SUT module
    // instance under vitest so leftover module state does not leak across files.
    void stopSampler
  })

  it('Test 4 — redis null no-op: tryWriteSample returns false, runOnce resolves cleanly (D-09)', async () => {
    vi.mocked(getLiveLeagueGames).mockResolvedValue({
      result: { games: [gameFixture(1, 5), gameFixture(2, 5)] },
    } as never)
    vi.mocked(buildSample).mockReturnValue({ t: 600, gold: 0, xp: 0 })
    // tryWriteSample returns false when redis is null (per historySampler primitive contract)
    vi.mocked(tryWriteSample).mockResolvedValue(false)

    await expect(runOnce()).resolves.toBeUndefined()

    expect(tryWriteSample).toHaveBeenCalledTimes(2)
    expect(logger.error).not.toHaveBeenCalled()
  })
})

describe('startSampler — env opt-out (D-07)', () => {
  it('logs disabled-via-env and skips timer when HISTORY_SAMPLER_DISABLED=1', () => {
    vi.useFakeTimers()
    vi.stubEnv('HISTORY_SAMPLER_DISABLED', '1')

    startSampler()

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'historySamplerJob' }),
      'history sampler disabled via env',
    )

    vi.advanceTimersByTime(INTERVAL_MS * 3)

    expect(getLiveLeagueGames).not.toHaveBeenCalled()
  })
})
