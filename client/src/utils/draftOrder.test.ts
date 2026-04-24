import { describe, it, expect } from 'vitest'
import { inferActiveTeam, inferFirstPickFromHistory } from './draftOrder'

// Red-state test (Phase 4 Wave 0, Nyquist contract per 04-VALIDATION.md).
// Until Plan 03 creates client/src/utils/draftOrder.ts with these two exports,
// the import line fails ("Cannot find module './draftOrder'") and the file reports
// a red test run. After Plan 03 all assertions turn green.
//
// CM 7.40 sequence (source: 04-CONTEXT §specifics, 04-RESEARCH §Section 2 verified
// against Liquipedia 2026-04-24). For Radiant first pick:
//   Ban Phase 1 (7 bans):  R-D-R-D-R-D-R    (indices 0..6)
//   Pick Phase 1 (4):      R-D-D-R          (indices 7..10)
//   Ban Phase 2 (4):       D-R-D-R          (indices 11..14)
//   Pick Phase 2 (4):      D-R-D-R          (indices 15..18)
//   Ban Phase 3 (2):       D-R              (indices 19..20)
//   Pick Phase 3 (2):      R-D              (indices 21..22)
// Total: 24 steps (14 bans + 10 picks). Per-team: 5 picks + 7 bans each.

describe('inferActiveTeam (DRAFT-02 turn inference)', () => {
  it('returns null when firstPickTeam is null (D-08 tentative escape hatch)', () => {
    expect(inferActiveTeam({ rPicks: 0, dPicks: 0, rBans: 0, dBans: 0 }, null)).toBeNull()
  })

  it('step 0 (Radiant first pick): 0 actions done → Radiant banning', () => {
    expect(inferActiveTeam({ rPicks: 0, dPicks: 0, rBans: 0, dBans: 0 }, 0))
      .toEqual({ team: 0, action: 'ban' })
  })

  it('step 0 (Dire first pick): mirrored sequence → Dire banning', () => {
    expect(inferActiveTeam({ rPicks: 0, dPicks: 0, rBans: 0, dBans: 0 }, 1))
      .toEqual({ team: 1, action: 'ban' })
  })

  it('step 1 (Radiant first): after Radiant banned once → Dire banning', () => {
    expect(inferActiveTeam({ rPicks: 0, dPicks: 0, rBans: 1, dBans: 0 }, 0))
      .toEqual({ team: 1, action: 'ban' })
  })

  it('step 7 (Radiant first): after 4 R-bans + 3 D-bans → Radiant picking (start of Pick Phase 1)', () => {
    expect(inferActiveTeam({ rPicks: 0, dPicks: 0, rBans: 4, dBans: 3 }, 0))
      .toEqual({ team: 0, action: 'pick' })
  })

  it('step 11 (Radiant first): after Pick Phase 1 complete (2 R-picks + 2 D-picks + 7 bans) → Dire banning', () => {
    expect(inferActiveTeam({ rPicks: 2, dPicks: 2, rBans: 4, dBans: 3 }, 0))
      .toEqual({ team: 1, action: 'ban' })
  })

  it('step 23 (Radiant first): after final Radiant pick of Pick Phase 3 → Dire picking (last step)', () => {
    // 22 steps done = 10 bans done + 2 pick phase 1 + 2 pick phase 2 = we need total 23 remaining, so index 22 = Dire picking
    // R-bans=7 (phase 1: 4, phase 2: 2, phase 3: 1), D-bans=7 (phase 1: 3, phase 2: 2, phase 3: 1), R-picks=5 ([7,10,16,18,21]), D-picks=4 ([8,9,15,17])
    expect(inferActiveTeam({ rPicks: 5, dPicks: 4, rBans: 7, dBans: 7 }, 0))
      .toEqual({ team: 1, action: 'pick' })
  })

  it('returns null when draft is complete (all 24 steps done) — Radiant first', () => {
    expect(inferActiveTeam({ rPicks: 5, dPicks: 5, rBans: 7, dBans: 7 }, 0)).toBeNull()
  })

  it('returns null when draft is complete — Dire first (mirrored)', () => {
    expect(inferActiveTeam({ rPicks: 5, dPicks: 5, rBans: 7, dBans: 7 }, 1)).toBeNull()
  })
})

describe('inferFirstPickFromHistory (DRAFT-02 first-pick heuristic)', () => {
  it('returns null for pristine scoreboard (both candidates equally plausible — PF-4)', () => {
    expect(inferFirstPickFromHistory({ radiant: {}, dire: {} })).toBeNull()
  })

  it('returns null when both teams have identical counts (ambiguous)', () => {
    // After 2 R-bans and 2 D-bans (step 4, symmetric), first-pick cannot be uniquely derived.
    expect(inferFirstPickFromHistory({
      radiant: { picks: [], bans: [{ hero_id: 1 }, { hero_id: 2 }] },
      dire:    { picks: [], bans: [{ hero_id: 3 }, { hero_id: 4 }] },
    })).toBeNull()
  })

  it('returns 0 (Radiant first) when only Radiant-first sequence matches observed counts', () => {
    // After step 2 with Radiant first: rBans=2, dBans=1 (R-D-R pattern).
    // With Dire first this would require dBans=2, rBans=1 — mismatch → only R-first matches.
    expect(inferFirstPickFromHistory({
      radiant: { picks: [], bans: [{ hero_id: 1 }, { hero_id: 2 }] },
      dire:    { picks: [], bans: [{ hero_id: 3 }] },
    })).toBe(0)
  })

  it('returns 1 (Dire first) when only Dire-first sequence matches observed counts', () => {
    // After step 2 with Dire first: dBans=2, rBans=1 (D-R-D pattern).
    expect(inferFirstPickFromHistory({
      radiant: { picks: [], bans: [{ hero_id: 1 }] },
      dire:    { picks: [], bans: [{ hero_id: 2 }, { hero_id: 3 }] },
    })).toBe(1)
  })
})
