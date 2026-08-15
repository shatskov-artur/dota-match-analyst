import { describe, it, expect, vi, beforeEach } from 'vitest'

// D-1 regression — the per-match diff state must actually be freed.
//
// snapshotWriter keeps a PrevState per match so consecutive ticks can be diffed into
// events. ingestJob was supposed to drop the ones that left the live feed, but it walked
// the matches it had JUST ARCHIVED and asked whether each was still live — and archivable
// is a subset of the live list by construction, so the condition was never true and the
// map grew for the entire uptime of the process. Nothing observable broke, which is
// exactly why it survived: a leak with no symptom and no test.
//
// The pruning now lives beside the map it prunes, and takes the set of ids that are live.
//
// This file mocks the archive as a chainable no-op so writeSnapshot runs far enough to
// register state; the pure extractors are covered in snapshotWriter.test.ts.

/** Minimal stand-in for the drizzle insert chain: thenable, and every step returns itself. */
function chain(): Record<string, unknown> {
  const p = Promise.resolve([]) as unknown as Record<string, unknown>
  p.values = () => chain()
  p.onConflictDoUpdate = () => chain()
  p.onConflictDoNothing = () => chain()
  return p
}

const fakeTx = { insert: () => chain() }
vi.mock('../../db/index.js', () => ({
  db: {
    insert: () => chain(),
    // writeSnapshot writes all five tables in one transaction (D-3).
    transaction: async (fn: (tx: typeof fakeTx) => Promise<unknown>) => fn(fakeTx),
  },
}))
vi.mock('../../logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import {
  writeSnapshot,
  prunePrevStates,
  prevStateCount,
  resetPrevState,
} from './snapshotWriter.js'
import type { EnrichedLiveGame } from '../liveAggregator.js'

function game(matchId: number, duration = 600): EnrichedLiveGame {
  return {
    match_id: matchId,
    league_id: 19719,
    game_state: 5,
    duration,
    league_name: 'The International 2026',
    history: [],
    roshan: null,
    team_logos: { radiant: null, dire: null },
    scoreboard: {
      duration,
      radiant: { score: 10, tower_state: 0x7ff, barracks_state: 0x3f, players: [{ net_worth: 6000 }] },
      dire: { score: 6, tower_state: 0x7ff, barracks_state: 0x3f, players: [{ net_worth: 3000 }] },
    },
  } as unknown as EnrichedLiveGame
}

describe('prevStates lifecycle (D-1)', () => {
  beforeEach(() => {
    resetPrevState()
  })

  it('registers one diff state per archived match', async () => {
    await writeSnapshot(game(111))
    await writeSnapshot(game(222))
    await writeSnapshot(game(333))
    expect(prevStateCount()).toBe(3)
  })

  it('frees the matches that are no longer live, and keeps the ones that are', async () => {
    await writeSnapshot(game(111))
    await writeSnapshot(game(222))
    await writeSnapshot(game(333))

    // Only 222 is still in Valve's feed.
    const dropped = prunePrevStates(new Set([222]))

    expect(dropped).toBe(2)
    expect(prevStateCount()).toBe(1)
  })

  it('drops everything when the feed goes empty — the case the old loop could never reach', async () => {
    await writeSnapshot(game(111))
    await writeSnapshot(game(222))
    expect(prunePrevStates(new Set())).toBe(2)
    expect(prevStateCount()).toBe(0)
  })

  it('is a no-op when every tracked match is still live', async () => {
    await writeSnapshot(game(111))
    await writeSnapshot(game(222))
    expect(prunePrevStates(new Set([111, 222]))).toBe(0)
    expect(prevStateCount()).toBe(2)
  })

  it('does not grow when the same match is archived tick after tick', async () => {
    await writeSnapshot(game(111, 600))
    await writeSnapshot(game(111, 630))
    await writeSnapshot(game(111, 660))
    expect(prevStateCount()).toBe(1)
  })
})
