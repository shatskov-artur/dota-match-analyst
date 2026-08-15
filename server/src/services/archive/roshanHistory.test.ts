import { describe, it, expect, vi, beforeEach } from 'vitest'

// Restarting the server mid-match used to reset the Roshan counter to zero, so the NEXT
// kill was announced as "#1". That is not cosmetic: the drop table is chosen BY KILL
// NUMBER — the first Roshan gives only the aegis, the third adds cheese and a refresher
// shard — so a restart during a late game advertised the wrong loot for the rest of it.
//
// The real number was on disk the whole time. Every detected kill is written to
// match_events as a `roshan` row carrying its number and the game second it happened at;
// recoverRoshanState reads that back instead of starting over.

let rows: Array<{ t: number; payload: unknown }> = []
let shouldThrow = false


vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  briefError: (e: unknown) => String(e),
}))

/** Minimal drizzle select chain: select().from().where().orderBy() resolves to rows. */
function selectChain(): Record<string, unknown> {
  const p = Promise.resolve(rows) as unknown as Record<string, unknown>
  p.from = () => selectChain()
  p.where = () => selectChain()
  p.orderBy = () => {
    if (shouldThrow) throw new Error('Connection terminated unexpectedly')
    return Promise.resolve(rows)
  }
  return p
}

let dbMock: unknown = { select: () => selectChain() }
vi.mock('../../db/index.js', () => ({
  get db() {
    return dbMock
  },
}))

const { recoverRoshanState } = await import('./roshanHistory.js')

beforeEach(() => {
  rows = []
  shouldThrow = false
  dbMock = { select: () => selectChain() }
})

describe('recoverRoshanState', () => {
  it('restores the real kill count after a restart, not a fresh 1', async () => {
    rows = [
      { t: 1100, payload: { killNumber: 1 } },
      { t: 1950, payload: { killNumber: 2 } },
      { t: 2480, payload: { killNumber: 3 } },
    ]
    const state = await recoverRoshanState(8932722908)
    expect(state?.killCount).toBe(3)
  })

  it('keeps WHEN each Roshan died, in game seconds', async () => {
    rows = [
      { t: 1100, payload: { killNumber: 1 } },
      { t: 2480, payload: { killNumber: 3 } },
      { t: 1950, payload: { killNumber: 2 } },
    ]
    const state = await recoverRoshanState(1)
    expect(state?.kills).toEqual([
      { n: 1, gameTime: 1100, timestamp: 0 },
      { n: 2, gameTime: 1950, timestamp: 0 },
      { n: 3, gameTime: 2480, timestamp: 0 },
    ])
  })

  it('does not double-count a kill reported by BOTH the sampler and OpenDota', async () => {
    // A backfilled match carries the live `roshan:2` row and OpenDota's own objective row
    // for the same event. Counting rows would report four Roshans in a two-Roshan game.
    rows = [
      { t: 1100, payload: { killNumber: 1 } },
      { t: 1102, payload: { killNumber: 1 } },
      { t: 1950, payload: { killNumber: 2 } },
      { t: 1951, payload: { killNumber: 2 } },
    ]
    const state = await recoverRoshanState(1)
    expect(state?.killCount).toBe(2)
    // The earliest sighting of a kill is the truthful one.
    expect(state?.kills.map((k) => k.gameTime)).toEqual([1100, 1950])
  })

  it('numbers rows that carry no killNumber, in time order', async () => {
    // OpenDota objective rows have no killNumber of their own.
    rows = [
      { t: 900, payload: {} },
      { t: 2000, payload: null },
    ]
    const state = await recoverRoshanState(1)
    expect(state?.kills).toEqual([
      { n: 1, gameTime: 900, timestamp: 0 },
      { n: 2, gameTime: 2000, timestamp: 0 },
    ])
  })

  it('returns null when the archive knows nothing, so the caller cold-starts as before', async () => {
    rows = []
    await expect(recoverRoshanState(1)).resolves.toBeNull()
  })

  it('returns null rather than throwing when the archive is off', async () => {
    dbMock = null
    await expect(recoverRoshanState(1)).resolves.toBeNull()
  })

  it('returns null rather than throwing when the query fails', async () => {
    // A live response must never break because the archive is unreachable.
    shouldThrow = true
    rows = [{ t: 1100, payload: { killNumber: 1 } }]
    await expect(recoverRoshanState(1)).resolves.toBeNull()
  })

  it('starts prevTimer at 0 so recovery cannot invent a kill that did not happen', async () => {
    rows = [{ t: 1100, payload: { killNumber: 1 } }]
    const state = await recoverRoshanState(1)
    expect(state?.prevTimer).toBe(0)
  })
})
