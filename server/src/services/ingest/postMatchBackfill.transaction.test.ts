import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regression guard for the ordering that makes a backfill recoverable.
//
// `ingestStatus: 'complete'` used to be written before the timeline, the player minutes and
// the event log. Anything that failed afterwards left the match flagged fully backfilled
// with nothing behind it — and claimBatch only ever picks rows in 'awaiting_parse', so the
// match was never revisited. For a game nobody recorded live, that is the data gone.
//
// Two properties are asserted here because both are load-bearing and neither is visible in
// a type: the writes happen inside ONE transaction, and the status update is its LAST
// statement. The expansion helpers themselves are covered in postMatchBackfill.test.ts.

interface Recorded {
  table: string
  op: 'insert' | 'update'
  values?: Record<string, unknown>
}

const recorded: Recorded[] = []
let transactionCount = 0
/** Set by a test to make the transaction body blow up after the data writes. */
let failAfterTable: string | null = null

/** Table identity as drizzle exposes it on the objects passed to insert()/update(). */
function tableName(table: unknown): string {
  const symbols = Object.getOwnPropertySymbols(table as object)
  for (const s of symbols) {
    if (String(s).includes('Name')) {
      const value = (table as Record<symbol, unknown>)[s]
      if (typeof value === 'string') return value
    }
  }
  return 'unknown'
}

/** Thenable stand-in for the drizzle builder chain: every step returns itself. */
function chain(entry: Recorded): Record<string, unknown> {
  const p = Promise.resolve([]) as unknown as Record<string, unknown>
  p.values = (v: Record<string, unknown>) => {
    entry.values = v
    if (failAfterTable && entry.table === failAfterTable) throw new Error('write failed')
    return chain(entry)
  }
  p.set = (v: Record<string, unknown>) => {
    entry.values = v
    return chain(entry)
  }
  p.where = () => chain(entry)
  p.onConflictDoUpdate = () => chain(entry)
  p.onConflictDoNothing = () => chain(entry)
  return p
}

function record(op: 'insert' | 'update', table: unknown): Record<string, unknown> {
  const entry: Recorded = { table: tableName(table), op }
  recorded.push(entry)
  return chain(entry)
}

const fakeTx = {
  insert: (table: unknown) => record('insert', table),
  update: (table: unknown) => record('update', table),
}

vi.mock('../../db/index.js', () => ({
  db: {
    insert: (table: unknown) => record('insert', table),
    update: (table: unknown) => record('update', table),
    transaction: async (fn: (tx: typeof fakeTx) => Promise<unknown>) => {
      transactionCount++
      return fn(fakeTx)
    },
  },
}))

const detail = {
  match_id: 8942152024,
  leagueid: 19719,
  version: 21,
  radiant_win: true,
  radiant_score: 30,
  dire_score: 18,
  duration: 2400,
  start_time: 1_760_000_000,
  radiant_team: { name: 'Team A' },
  dire_team: { name: 'Team B' },
  radiant_gold_adv: [0, 100, 250],
  radiant_xp_adv: [0, 90, 210],
  players: [],
  objectives: [],
}

vi.mock('../openDotaApi.js', () => ({
  getMatchDetail: vi.fn(async () => detail),
}))
vi.mock('../analysis/index.js', () => ({
  computeAndStoreAnalysis: vi.fn(async () => undefined),
}))
vi.mock('../../env.js', () => ({ trackedLeagueIds: new Set<number>([19719]) }))
vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  briefError: (err: unknown) => String(err),
}))

import { backfillMatch } from './postMatchBackfill.js'

describe('backfillMatch — write ordering and atomicity', () => {
  beforeEach(() => {
    recorded.length = 0
    transactionCount = 0
    failAfterTable = null
  })

  it('completes a parsed match', async () => {
    await expect(backfillMatch(detail.match_id)).resolves.toBe('complete')
  })

  it('writes the archived rows inside a single transaction', async () => {
    await backfillMatch(detail.match_id)
    expect(transactionCount).toBe(1)
  })

  it('marks the match complete only after the timeline is written', async () => {
    await backfillMatch(detail.match_id)

    const statusWrite = recorded.findIndex(
      (r) => r.op === 'update' && (r.values as { ingestStatus?: string } | undefined)?.ingestStatus === 'complete',
    )
    const timelineWrite = recorded.findIndex((r) => r.table === 'match_timeline')

    expect(statusWrite).toBeGreaterThan(-1)
    expect(timelineWrite).toBeGreaterThan(-1)
    // The whole point: the row is claimable until its data is actually there.
    expect(statusWrite).toBeGreaterThan(timelineWrite)
  })

  it('marks the match complete only after the raw payload is stored', async () => {
    await backfillMatch(detail.match_id)

    const statusWrite = recorded.findIndex(
      (r) => r.op === 'update' && (r.values as { ingestStatus?: string } | undefined)?.ingestStatus === 'complete',
    )
    const rawWrite = recorded.findIndex((r) => r.table === 'post_match_raw')

    expect(statusWrite).toBeGreaterThan(rawWrite)
  })

  it('never marks the match complete when a data write throws', async () => {
    failAfterTable = 'match_timeline'

    await expect(backfillMatch(detail.match_id)).rejects.toThrow()

    const marked = recorded.some(
      (r) => (r.values as { ingestStatus?: string } | undefined)?.ingestStatus === 'complete',
    )
    // The transaction rolls back and the row stays in 'awaiting_parse' for the next tick.
    expect(marked).toBe(false)
  })

  it('still writes the result before the parse, so a finished game is not blank', async () => {
    await backfillMatch(detail.match_id)

    // The early summary update runs outside the transaction on purpose: radiant_win is
    // published within a minute of the game ending, the parse can take twenty more.
    const firstWrite = recorded[0]
    expect(firstWrite.op).toBe('update')
    expect((firstWrite.values as { radiantWin?: boolean }).radiantWin).toBe(true)
  })
})
