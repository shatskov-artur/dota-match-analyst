import { describe, it, expect, vi, beforeEach } from 'vitest'

// Atomicity of one league's schedule sync.
//
// syncLeague writes six tables that together describe a single moment of one tournament:
// the league row, teams, standings, bracket nodes, series and match stubs. They used to be
// six separate statements, so a failure on the fourth left fresh standings beside a stale
// bracket with nothing to say the two disagreed — the schedule simply showed a tournament
// that had half moved on. snapshotWriter has written its five tables in one transaction
// since Phase A and explains why; this path never caught up.
//
// The second assertion is the one that is easy to lose later: NO network call may happen
// inside the transaction. An open transaction holds one of ten pool connections, and an
// OpenDota round trip inside it pins that connection for the length of an HTTP request.

const writes: string[] = []
let transactionDepth = 0
let maxTransactionCount = 0
/** Upstream calls recorded with the transaction depth at which they happened. */
const upstreamCallsAtDepth: number[] = []

function chain(): Record<string, unknown> {
  const p = Promise.resolve([]) as unknown as Record<string, unknown>
  p.values = () => chain()
  p.set = () => chain()
  p.where = () => chain()
  p.onConflictDoUpdate = () => chain()
  p.onConflictDoNothing = () => chain()
  return p
}

function tableName(table: unknown): string {
  for (const s of Object.getOwnPropertySymbols(table as object)) {
    if (String(s).includes('Name')) {
      const v = (table as Record<symbol, unknown>)[s]
      if (typeof v === 'string') return v
    }
  }
  return 'unknown'
}

const fakeTx = {
  insert: (t: unknown) => {
    writes.push(`tx:insert:${tableName(t)}`)
    return chain()
  },
  delete: (t: unknown) => {
    writes.push(`tx:delete:${tableName(t)}`)
    return chain()
  },
  update: (t: unknown) => {
    writes.push(`tx:update:${tableName(t)}`)
    return chain()
  },
}

vi.mock('../../db/index.js', () => ({
  db: {
    insert: (t: unknown) => {
      writes.push(`bare:insert:${tableName(t)}`)
      return chain()
    },
    update: (t: unknown) => {
      writes.push(`bare:update:${tableName(t)}`)
      return chain()
    },
    delete: (t: unknown) => {
      writes.push(`bare:delete:${tableName(t)}`)
      return chain()
    },
    select: () => chain(),
    transaction: async (fn: (tx: typeof fakeTx) => Promise<unknown>) => {
      maxTransactionCount++
      transactionDepth++
      try {
        return await fn(fakeTx)
      } finally {
        transactionDepth--
      }
    },
  },
}))

const now = Math.floor(Date.now() / 1000)

const leagueData = {
  info: {
    name: 'The International 2026',
    tier: 5,
    start_timestamp: now - 86_400,
    end_timestamp: now + 86_400,
  },
  node_groups: [
    {
      node_group_id: 1,
      name: 'Playoff',
      team_standings: [
        { team_id: 2163, standing: 1, wins: 3, losses: 0 },
        // Valve pads with placeholder seats; they must not reach the insert.
        { team_id: 0, standing: 9 },
      ],
      nodes: [
        {
          node_id: 11,
          series_id: 501,
          team_id_1: 2163,
          team_id_2: 39,
          scheduled_time: now + 3600,
          team_1_wins: 1,
          team_2_wins: 0,
          matches: [{ match_id: 8942152024 }],
        },
      ],
    },
  ],
  series_infos: [],
  streams: [],
}

vi.mock('../valveApi.js', () => ({
  getLeagueData: vi.fn(async () => {
    upstreamCallsAtDepth.push(transactionDepth)
    return leagueData
  }),
}))

vi.mock('../openDotaApi.js', () => ({
  getLeagueInfo: vi.fn(async () => {
    upstreamCallsAtDepth.push(transactionDepth)
    return { name: 'The International 2026', tier: 'premium' }
  }),
  getLeagueMatches: vi.fn(async () => {
    upstreamCallsAtDepth.push(transactionDepth)
    return []
  }),
}))

vi.mock('./archivePolicy.js', () => ({
  shouldArchiveLeague: vi.fn(async () => {
    upstreamCallsAtDepth.push(transactionDepth)
    return true
  }),
  filterArchivableLeagues: vi.fn(async (ids: number[]) => ids),
  reportSkippedLeagues: vi.fn(),
}))

vi.mock('../../env.js', () => ({ trackedLeagueIds: new Set<number>([19719]) }))
vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  briefError: (err: unknown) => String(err),
}))

import { syncLeague } from './tournamentSync.js'

describe('syncLeague — atomicity', () => {
  beforeEach(() => {
    writes.length = 0
    upstreamCallsAtDepth.length = 0
    transactionDepth = 0
    maxTransactionCount = 0
  })

  it('completes a sync', async () => {
    const result = await syncLeague(19719)
    expect(result).not.toBeNull()
  })

  it('opens exactly one transaction', async () => {
    await syncLeague(19719)
    expect(maxTransactionCount).toBe(1)
  })

  it('performs the sync writes through the transaction, with one deliberate exception', async () => {
    await syncLeague(19719)

    expect(writes.length).toBeGreaterThan(0)
    const bare = writes.filter((w) => w.startsWith('bare:'))

    // recordLeagueTier is the exception, and it is intentional: it runs BEFORE the Valve
    // call, so the tier can still be learned on a tick where Valve's bracket endpoint is
    // down — the bug that once parked The International in the tier filter's "Other"
    // bucket. It writes one column and belongs to no transaction. Pinned exactly, so a
    // NEW bare write would fail this test rather than slip in beside it.
    expect(bare).toEqual(['bare:update:leagues'])
  })

  it('writes the league, bracket and series tables together', async () => {
    await syncLeague(19719)

    // Not an exhaustive list — the point is that these land in the same transaction, so a
    // half-applied sync cannot show a fresh bracket beside stale standings.
    expect(writes).toContain('tx:insert:leagues')
    expect(writes).toContain('tx:insert:bracket_nodes')
    expect(writes).toContain('tx:insert:series')
  })

  it('makes no upstream call while the transaction is open', async () => {
    await syncLeague(19719)

    expect(upstreamCallsAtDepth.length).toBeGreaterThan(0)
    // Every recorded call must have happened at depth 0 — outside the transaction.
    expect(upstreamCallsAtDepth.filter((d) => d > 0)).toEqual([])
  })
})
