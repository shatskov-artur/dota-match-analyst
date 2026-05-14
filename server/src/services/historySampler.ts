import { redis } from '../cache.js'
import { logger } from '../logger.js'

// Phase 10 Plan 01 — Historical graphs sampler.
//
// Pure aggregator + three I/O wrappers that store time-series points
// {t, gold, xp} per match_id in Redis, throttled by a 5s NX gate,
// capped at 240 points (LTRIM), with a 2h TTL (EXPIRE refreshed each write).
//
// All Redis I/O is fire-and-forget (D-09): wrappers swallow errors via
// try/catch and never throw to the caller. When `redis` is null (Upstash
// misconfigured) every wrapper short-circuits gracefully.

const TTL_SECONDS = 7200 // D-12: 2h, refreshed on every write
const TIMESERIES_LIMIT = 240 // D-11: ~2h of 30s samples
const SAMPLE_GATE_SECONDS = 5 // D-06: NX throttle window

function tsKey(matchId: number): string {
  return `timeseries:${matchId}`
}

function gateKey(matchId: number): string {
  return `lastSample:${matchId}`
}

export interface HistorySample {
  t: number
  gold: number
  xp: number
}

/**
 * Pure aggregator. No I/O. (D-07, D-08, D-15, D-16, D-18)
 *
 * Returns null when:
 *   - game_state !== 5 (not in-game; draft/lobby/post-game produce no points)
 *   - duration is 0 / missing on both top-level and scoreboard
 *   - either team's players[] is empty/missing
 *
 * Sign convention: Radiant-positive (gold = sumNwR - sumNwD,
 * xp = round(teamXpR - teamXpD)).
 *
 * Field-name fallback: Valve's canonical scoreboard player field is
 * `xp_per_min` (verified server/src/routes/live.ts:89). Older / typed
 * fixtures use `xpm`; both are accepted. Non-finite values (NaN, Infinity,
 * undefined) contribute 0 — D-18 undercount over crash.
 */
export function buildSample(game: {
  scoreboard?: {
    radiant?: {
      players?: Array<{
        net_worth?: number
        xpm?: number
        xp_per_min?: number
        gold_per_min?: number
      }>
    }
    dire?: {
      players?: Array<{
        net_worth?: number
        xpm?: number
        xp_per_min?: number
        gold_per_min?: number
      }>
    }
    duration?: number
  }
  duration?: number
  game_state?: number
}): HistorySample | null {
  if (game.game_state !== 5) return null
  const duration = game.scoreboard?.duration ?? game.duration ?? 0
  if (!duration) return null
  const r = game.scoreboard?.radiant?.players ?? []
  const d = game.scoreboard?.dire?.players ?? []
  if (r.length === 0 || d.length === 0) return null
  const sumNw = (ps: typeof r) =>
    ps.reduce((s, p) => s + (Number.isFinite(p.net_worth) ? (p.net_worth as number) : 0), 0)
  // Pick the first finite value from [xp_per_min, xpm]; otherwise 0.
  // Mirrors server/src/routes/live.ts:89 `stats.xp_per_min ?? p.xpm` pattern.
  const xpmOf = (p: { xp_per_min?: number; xpm?: number }): number => {
    if (Number.isFinite(p.xp_per_min)) return p.xp_per_min as number
    if (Number.isFinite(p.xpm)) return p.xpm as number
    return 0
  }
  const teamXp = (ps: typeof r) =>
    ps.reduce((s, p) => s + (xpmOf(p) * duration) / 60, 0)
  return {
    t: Math.floor(duration),
    gold: sumNw(r) - sumNw(d),
    xp: Math.round(teamXp(r) - teamXp(d)),
  }
}

/**
 * Append one sample to timeseries:{matchId}, throttled by a 5s NX gate.
 * (D-06, D-09, D-10, D-11, D-12)
 *
 * On NX-gate acquire: RPUSH → LTRIM(-240, -1) → EXPIRE(7200), in order.
 * On gate held / redis null / any throw: returns false silently.
 */
export async function tryWriteSample(
  matchId: number,
  sample: HistorySample,
): Promise<boolean> {
  if (!redis) return false
  try {
    const acquired = await redis.set(
      gateKey(matchId),
      '1',
      'EX',
      SAMPLE_GATE_SECONDS,
      'NX',
    )
    if (acquired !== 'OK') return false
    const k = tsKey(matchId)
    await redis.rpush(k, JSON.stringify(sample))
    await redis.ltrim(k, -TIMESERIES_LIMIT, -1)
    await redis.expire(k, TTL_SECONDS)
    return true
  } catch (err) {
    logger.error(
      { matchId, err: (err as Error).message },
      'history write failed',
    )
    return false
  }
}

/**
 * Read the full timeseries list for a match. (D-10)
 * Returns [] when redis is null, on JSON parse error, or any throw.
 */
export async function readHistory(
  matchId: number,
): Promise<HistorySample[]> {
  if (!redis) return []
  try {
    const raw = await redis.lrange(tsKey(matchId), 0, -1)
    return raw.map((s) => JSON.parse(s) as HistorySample)
  } catch (err) {
    logger.error(
      { matchId, err: (err as Error).message },
      'history read failed',
    )
    return []
  }
}

/**
 * Explicit cleanup on game_state === 6. (D-13)
 * DELs both timeseries:{id} and lastSample:{id}; TTL is the safety net
 * if the post-game state is missed.
 */
export async function deleteHistory(matchId: number): Promise<void> {
  if (!redis) return
  try {
    await redis.del(tsKey(matchId), gateKey(matchId))
  } catch (err) {
    logger.error(
      { matchId, err: (err as Error).message },
      'history delete failed',
    )
  }
}
