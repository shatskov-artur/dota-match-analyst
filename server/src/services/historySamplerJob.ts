import { getLiveLeagueGames } from './valveApi.js'
import {
  buildSample,
  tryWriteSample,
  deleteHistory,
  type HistorySample,
} from './historySampler.js'
import { logger } from '../logger.js'

// Phase 10.1 — background history sampler job.
//
// In-process setInterval that polls Valve every 30s and runs tryWriteSample
// for every active tournament match, independent of user requests.
//
// Locked decisions (see 10.1-CONTEXT.md):
//   D-01 startSampler/stopSampler called from index.ts before serve()
//   D-04 Promise.allSettled per-match fan-out
//   D-05 module-level isRunning skip-if-overlap with warn log
//   D-06 per-match try/catch nested in outer tick try/catch
//   D-07 HISTORY_SAMPLER_DISABLED === '1' opt-out
//   D-09 redis null → tick still runs, primitives short-circuit
//   D-11 INTERVAL_MS = 30_000
//   D-12 use getLiveLeagueGames (NOT Fast)
//   D-13 derivedGameState ∈ {5, 6} filter

export const INTERVAL_MS = 30_000
export const SAMPLER_SOURCE = 'historySamplerJob'

let handle: NodeJS.Timeout | null = null
let isRunning = false
let inFlight: Promise<void> | null = null
let inFlightStartedAt = 0

type ValveLiveGame = {
  match_id?: number
  game_state?: number
  duration?: number
  scoreboard?: {
    duration?: number
    radiant?: { players?: Array<{ net_worth?: number; xpm?: number }> }
    dire?: { players?: Array<{ net_worth?: number; xpm?: number }> }
  }
}

function deriveGameState(g: ValveLiveGame): number {
  if (typeof g.game_state === 'number') return g.game_state
  const radiantPlayers = g.scoreboard?.radiant?.players
  return Array.isArray(radiantPlayers) && radiantPlayers.length > 0 ? 5 : 2
}

async function processMatch(g: ValveLiveGame): Promise<void> {
  const matchId = g.match_id
  if (typeof matchId !== 'number') return
  const state = deriveGameState(g)
  try {
    if (state === 6) {
      await deleteHistory(matchId)
      return
    }
    if (state === 5) {
      const sample = buildSample({
        scoreboard: g.scoreboard,
        duration: g.duration,
        game_state: 5,
      })
      if (sample) {
        await tryWriteSample(matchId, sample)
      }
    }
  } catch (err) {
    logger.error(
      { matchId, err: (err as Error).message },
      'history sampler match failed',
    )
  }
}

/**
 * Public contract:
 *   - if isRunning → logger.warn({ inFlightAgeMs }, 'history sampler tick overlap, skipping') and return
 *   - else: getLiveLeagueGames(), filter derivedGameState ∈ {5,6}, allSettled per-match
 *   - per-match try/catch: 5 → buildSample + tryWriteSample; 6 → deleteHistory
 *   - outer try/catch on getLiveLeagueGames throws → logger.error('history sampler tick failed')
 */
export async function runOnce(): Promise<void> {
  if (isRunning) {
    const inFlightAgeMs = Date.now() - inFlightStartedAt
    logger.warn(
      { inFlightAgeMs },
      'history sampler tick overlap, skipping',
    )
    return
  }
  isRunning = true
  inFlightStartedAt = Date.now()
  try {
    const data = await getLiveLeagueGames()
    const games = (data?.result?.games ?? []) as ValveLiveGame[]
    const active = games.filter((g) => {
      if (typeof g.match_id !== 'number') return false
      const s = deriveGameState(g)
      return s === 5 || s === 6
    })
    await Promise.allSettled(active.map((g) => processMatch(g)))
  } catch (err) {
    logger.error(
      { err: (err as Error).message },
      'history sampler tick failed',
    )
  } finally {
    isRunning = false
  }
}

/**
 * Wave 2 fills body. Public contract:
 *   - process.env.HISTORY_SAMPLER_DISABLED === '1' → logger.info('history sampler disabled via env'), return
 *   - if (handle) return  // idempotent
 *   - handle = setInterval(() => { inFlight = runOnce() }, INTERVAL_MS)
 *   - logger.info({ intervalMs: INTERVAL_MS, source: SAMPLER_SOURCE }, 'history sampler started')
 */
export function startSampler(): void {
  if (process.env.HISTORY_SAMPLER_DISABLED === '1') {
    logger.info(
      { source: SAMPLER_SOURCE },
      'history sampler disabled via env',
    )
    return
  }
  if (handle) return // idempotent — second call is a no-op
  handle = setInterval(() => {
    inFlight = runOnce()
  }, INTERVAL_MS)
  logger.info(
    { intervalMs: INTERVAL_MS, source: SAMPLER_SOURCE },
    'history sampler started',
  )
}

/**
 * Public contract:
 *   - if (handle) clearInterval(handle); handle = null
 *   - if (inFlight) await inFlight
 *   - logger.info({ source: SAMPLER_SOURCE }, 'history sampler stopped')
 */
export async function stopSampler(): Promise<void> {
  if (handle) {
    clearInterval(handle)
    handle = null
  }
  if (inFlight) {
    try {
      await inFlight
    } catch {
      // runOnce already swallows + logs; defensive catch in case body changes.
    }
    inFlight = null
  }
  logger.info(
    { source: SAMPLER_SOURCE },
    'history sampler stopped',
  )
}

export type { HistorySample }
