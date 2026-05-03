import { redis } from '../cache.js'

export interface RoshanState {
  killCount: number
  prevTimer: number
  kills: Array<{ n: number; gameTime: number; timestamp: number }>
}

const TTL_SECONDS = 6 * 60 * 60 // D-07: 6 hours

function key(matchId: number): string {
  return `roshan:${matchId}`
}

/**
 * Reads Roshan state from Redis. Returns null on:
 *  - missing key (no prior state for this match)
 *  - redis === null (Upstash misconfigured — graceful degradation)
 *  - JSON parse error
 *  - any redis.get throw
 */
export async function readRoshanState(matchId: number): Promise<RoshanState | null> {
  if (!redis) return null
  try {
    const raw = await redis.get(key(matchId))
    if (raw === null) return null
    return JSON.parse(raw) as RoshanState
  } catch (err) {
    console.error(`[roshan] read error for ${matchId}:`, (err as Error).message)
    return null
  }
}

/**
 * Writes Roshan state to Redis with 6h TTL.
 * No-ops gracefully when redis is null or on any redis.set throw.
 */
export async function writeRoshanState(matchId: number, state: RoshanState): Promise<void> {
  if (!redis) return
  try {
    await redis.set(key(matchId), JSON.stringify(state), 'EX', TTL_SECONDS)
  } catch (err) {
    console.error(`[roshan] write error for ${matchId}:`, (err as Error).message)
  }
}

/**
 * Pure transition detector. No I/O.
 *
 * D-01: increment when prev.prevTimer===0 && curTimer>0
 * D-04: bootstrap on mid-match join (prev===null && curTimer>0 → killCount=1)
 */
export function detectRoshanKill(
  prev: RoshanState | null,
  curTimer: number | undefined,
  gameTime: number,
  now: number,
): { state: RoshanState; killed: boolean } {
  if (curTimer === undefined) {
    return {
      state: prev ?? { killCount: 0, prevTimer: 0, kills: [] },
      killed: false,
    }
  }

  if (prev === null) {
    if (curTimer > 0) {
      return {
        state: {
          killCount: 1,
          prevTimer: curTimer,
          kills: [{ n: 1, gameTime, timestamp: now }],
        },
        killed: true,
      }
    }
    return { state: { killCount: 0, prevTimer: 0, kills: [] }, killed: false }
  }

  if (prev.prevTimer === 0 && curTimer > 0) {
    const n = prev.killCount + 1
    return {
      state: {
        killCount: n,
        prevTimer: curTimer,
        kills: [...prev.kills, { n, gameTime, timestamp: now }],
      },
      killed: true,
    }
  }

  return {
    state: { ...prev, prevTimer: curTimer },
    killed: false,
  }
}
