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

/**
 * Wave 2 fills body. Public contract:
 *   - if isRunning → logger.warn({ inFlightAgeMs }, 'history sampler tick overlap, skipping') and return
 *   - else: getLiveLeagueGames(), filter derivedGameState ∈ {5,6}, allSettled per-match
 *   - per-match try/catch: 5 → buildSample + tryWriteSample; 6 → deleteHistory
 *   - outer try/catch on getLiveLeagueGames throws → logger.error('history sampler tick failed')
 */
export async function runOnce(): Promise<void> {
  // Wave 2: implement. Skeleton resolves immediately so Wave 1 RED tests can import.
  return
}

/**
 * Wave 2 fills body. Public contract:
 *   - process.env.HISTORY_SAMPLER_DISABLED === '1' → logger.info('history sampler disabled via env'), return
 *   - if (handle) return  // idempotent
 *   - handle = setInterval(() => { inFlight = runOnce() }, INTERVAL_MS)
 *   - logger.info({ intervalMs: INTERVAL_MS, source: SAMPLER_SOURCE }, 'history sampler started')
 */
export function startSampler(): void {
  // Wave 2: implement.
}

/**
 * Wave 2 fills body. Public contract:
 *   - if (handle) clearInterval(handle); handle = null
 *   - if (inFlight) await inFlight
 *   - logger.info({ source: SAMPLER_SOURCE }, 'history sampler stopped')
 */
export async function stopSampler(): Promise<void> {
  // Wave 2: implement.
}

// Silence unused-import warnings in the skeleton — Wave 2 consumes these.
void getLiveLeagueGames
void buildSample
void tryWriteSample
void deleteHistory
void logger
void isRunning
void inFlight
export type { HistorySample }
