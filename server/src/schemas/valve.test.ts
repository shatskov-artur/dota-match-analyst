import { describe, it, expect } from 'vitest'
import { LiveGameSchema } from './valve.js'

// Phase 4 Wave 0 Nyquist contract per 04-VALIDATION.md.
// DEVIATION from original red-state intent (see 04-01-SUMMARY.md §Deviations):
// Plan 04-02 (`feat(04-02): add ScoreboardSchema and TTL.DRAFT`) already landed in HEAD
// before Plan 04-01 executed in this worktree, so the schema-extension contract is
// already implemented. These tests now serve as GREEN-state regression coverage for
// DRAFT-01 — they lock the behavioral contract that Plan 02's schema must continue
// to satisfy and codify the precise shape downstream Plans 03/04 depend on.

describe('LiveGameSchema — scoreboard extension (Phase 4 — DRAFT-01 schema contract)', () => {
  it('accepts a payload without scoreboard (pre-draft lobby — D-10)', () => {
    const raw = { match_id: 1, lobby_id: 2, league_id: 3 }
    expect(() => LiveGameSchema.parse(raw)).not.toThrow()
  })

  it('accepts scoreboard with both teams present and picks/bans arrays (D-17)', () => {
    const raw = {
      match_id: 1, lobby_id: 2, league_id: 3,
      scoreboard: {
        radiant: { picks: [{ hero_id: 1 }, { hero_id: 14 }], bans: [{ hero_id: 99 }] },
        dire:    { picks: [],                                bans: [{ hero_id: 42 }] },
      },
    }
    const parsed = LiveGameSchema.parse(raw)
    expect(parsed.scoreboard?.radiant?.picks).toHaveLength(2)
    expect(parsed.scoreboard?.radiant?.picks?.[0]?.hero_id).toBe(1)
    expect(parsed.scoreboard?.radiant?.picks?.[1]?.hero_id).toBe(14)
    expect(parsed.scoreboard?.dire?.bans?.[0]?.hero_id).toBe(42)
    expect(parsed.scoreboard?.dire?.picks).toHaveLength(0)
  })

  it('passes through unknown fields on scoreboard (CLAUDE.md .passthrough() discipline — T-04-02 mitigation)', () => {
    const raw = {
      match_id: 1, lobby_id: 2, league_id: 3,
      scoreboard: {
        radiant: { picks: [], bans: [], score: 7, tower_state: 2047 }, // score / tower_state not declared in TeamScoreboardSchema
        dire:    { picks: [], bans: [] },
      },
    }
    const parsed = LiveGameSchema.parse(raw)
    // .passthrough() preserves unknown fields — they survive .parse() untyped.
    // Using `as any` to reach the passthrough-preserved property intentionally.
    expect((parsed.scoreboard?.radiant as any)?.score).toBe(7)
    expect((parsed.scoreboard?.radiant as any)?.tower_state).toBe(2047)
  })

  it('accepts scoreboard.radiant = {} with no picks/bans — both optional (D-17)', () => {
    const raw = {
      match_id: 1, lobby_id: 2, league_id: 3,
      scoreboard: { radiant: {}, dire: {} },
    }
    expect(() => LiveGameSchema.parse(raw)).not.toThrow()
  })

  it('accepts picks entry with hero_id undefined (draft pre-lock state — PF-8)', () => {
    const raw = {
      match_id: 1, lobby_id: 2, league_id: 3,
      scoreboard: { radiant: { picks: [{}] }, dire: {} },
    }
    expect(() => LiveGameSchema.parse(raw)).not.toThrow()
    const parsed = LiveGameSchema.parse(raw)
    expect(parsed.scoreboard?.radiant?.picks?.[0]?.hero_id).toBeUndefined()
  })
})

// Phase 8 Wave 0 — RED-state contract for PlayerSchema phase-8 fields.
// Locks the verified field-name correction (position_x/position_y NOT x_pos/y_pos)
// and the four new optional fields. Plan 02 will add explicit z.number() validation
// to PlayerSchema; the rejection-of-non-numeric test below is currently RED.

function gameWithPlayer(player: Record<string, unknown>) {
  return { match_id: 1, lobby_id: 1, league_id: 1, players: [player] }
}

describe('PlayerSchema phase-8 fields', () => {
  it('accepts position_x, position_y, ultimate_state, ultimate_cooldown as optional numbers', () => {
    const result = LiveGameSchema.safeParse(gameWithPlayer({
      account_id: 1, hero_id: 1, team: 0,
      position_x: -7000, position_y: 6000,
      ultimate_state: 2, ultimate_cooldown: 47.5,
    }))
    expect(result.success).toBe(true)
    if (result.success) {
      const p = result.data.players?.[0] as Record<string, unknown>
      expect(p.position_x).toBe(-7000)
      expect(p.position_y).toBe(6000)
      expect(p.ultimate_state).toBe(2)
      expect(p.ultimate_cooldown).toBe(47.5)
    }
  })

  it('accepts player with phase-8 fields omitted', () => {
    const result = LiveGameSchema.safeParse(gameWithPlayer({ account_id: 1, hero_id: 1, team: 0 }))
    expect(result.success).toBe(true)
  })

  it('rejects non-numeric ultimate_state', () => {
    const result = LiveGameSchema.safeParse(gameWithPlayer({
      account_id: 1, hero_id: 1, team: 0,
      ultimate_state: 'active',
    }))
    expect(result.success).toBe(false)
  })

  it('passthrough preserves unknown fields like position_z', () => {
    const result = LiveGameSchema.safeParse(gameWithPlayer({
      account_id: 1, hero_id: 1, team: 0,
      position_x: 0, position_y: 0,
      ultimate_state: 1, ultimate_cooldown: 0,
      position_z: 42,
    }))
    expect(result.success).toBe(true)
    if (result.success) {
      const p = result.data.players?.[0] as Record<string, unknown>
      expect(p.position_z).toBe(42)
    }
  })
})
