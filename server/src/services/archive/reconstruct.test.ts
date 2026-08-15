import { describe, it, expect, vi } from 'vitest'

vi.mock('../../db/index.js', () => ({ db: null }))

import { finalItemsFrom, levelFromXp, npcNameForHero, replayBuildings } from './reconstruct.js'
import { buildingDecoder } from '../../../../shared/buildingDecoder.js'

const ev = (type: string, t: number, payload: unknown) => ({ type, t, payload })
const tower = (side: string, lane: string, tier: string) => ({ side, lane, tier, kind: 'tower' })
const rax = (side: string, lane: string, tier: string) => ({ side, lane, tier, kind: 'barracks' })

// The OTHER dialect: what snapshotWriter.detectEvents writes while a match is live.
// A tower row carries no `kind` at all and spells the tier 'tier1'; a barracks row carries
// no `tier` and hides the type inside `kind`. See normalizeBuilding in reconstruct.ts.
const liveTower = (side: string, lane: string, tier: string) => ({ side, lane, tier })
const liveRax = (side: string, lane: string, kind: string) => ({ side, lane, kind })

describe('levelFromXp', () => {
  it('maps XP to the level it actually buys', () => {
    expect(levelFromXp(0)).toBe(1)
    expect(levelFromXp(239)).toBe(1)
    expect(levelFromXp(240)).toBe(2)
    expect(levelFromXp(2440)).toBe(6)
    expect(levelFromXp(63900)).toBe(30)
    // Past the table there is nowhere further to go.
    expect(levelFromXp(999_999)).toBe(30)
  })

  it('returns undefined rather than a level for missing XP', () => {
    // player_timeline.xp is nullable; a fake "level 1" would be read as a real reading.
    expect(levelFromXp(null)).toBeUndefined()
  })
})

describe('npcNameForHero', () => {
  it('derives the kill-log name from the portrait slug', () => {
    expect(npcNameForHero(9)).toBe('npc_dota_hero_mirana')
    // The reason this is derived rather than hand-listed: display name and npc name
    // disagree for a dozen heroes, and Nature's Prophet is the classic one.
    expect(npcNameForHero(53)).toBe('npc_dota_hero_furion')
    expect(npcNameForHero(114)).toBe('npc_dota_hero_monkey_king')
  })

  it('returns null for an unknown hero id', () => {
    expect(npcNameForHero(99999)).toBeNull()
  })
})

describe('replayBuildings', () => {
  it('starts with everything standing', () => {
    const { towerState, barracksState } = replayBuildings([], 0)
    const b = buildingDecoder(towerState, barracksState)
    expect(b.unavailable).toBe(false)
    expect(b.radiant.top).toEqual({ tier1: true, tier2: true, tier3: true, meleeRax: true, rangedRax: true })
    expect(b.dire.bot.tier3).toBe(true)
  })

  it('clears exactly the building that fell, on the side that lost it', () => {
    const { towerState, barracksState } = replayBuildings(
      [ev('tower', 600, tower('dire', 'mid', 'T1'))],
      1200,
    )
    const b = buildingDecoder(towerState, barracksState)
    expect(b.dire.mid.tier1).toBe(false)
    expect(b.dire.mid.tier2).toBe(true)
    expect(b.radiant.mid.tier1).toBe(true)
  })

  it('ignores anything that fell after the minute being shown', () => {
    // This is the whole point of the scrubber: minute 10 must not know about minute 30.
    const events = [ev('tower', 600, tower('dire', 'top', 'T1')), ev('tower', 1800, tower('dire', 'top', 'T2'))]
    const early = buildingDecoder(...Object.values(replayBuildings(events, 900)) as [number, number])
    expect(early.dire.top.tier1).toBe(false)
    expect(early.dire.top.tier2).toBe(true)

    const late = buildingDecoder(...Object.values(replayBuildings(events, 2400)) as [number, number])
    expect(late.dire.top.tier2).toBe(false)
  })

  // A-2 regression: the live writer and the OpenDota writer describe the same event with
  // different keys, and this reader understood only the second. Every live-recorded
  // building row was skipped in silence — the replayed minute showed those buildings as
  // still standing.
  it('reads the live dialect too: a tower row with no `kind` and tier "tier1"', () => {
    const { towerState, barracksState } = replayBuildings(
      [ev('tower', 600, liveTower('dire', 'mid', 'tier1'))],
      1200,
    )
    const b = buildingDecoder(towerState, barracksState)
    expect(b.dire.mid.tier1).toBe(false)
    expect(b.dire.mid.tier2).toBe(true)
  })

  it('reads the live dialect for barracks: kind "meleeRax" with no tier', () => {
    const { towerState, barracksState } = replayBuildings(
      [ev('barracks', 100, liveRax('radiant', 'bot', 'meleeRax'))],
      3000,
    )
    const b = buildingDecoder(towerState, barracksState)
    expect(b.radiant.bot.meleeRax).toBe(false)
    expect(b.radiant.bot.rangedRax).toBe(true)
  })

  it('reads the live ancient tier — lane "ancient", tier "tier4"', () => {
    const { towerState, barracksState } = replayBuildings(
      [ev('tower', 500, liveTower('dire', 'ancient', 'tier4'))],
      3000,
    )
    const b = buildingDecoder(towerState, barracksState)
    expect(b.dire.ancientTop).toBe(false)
    expect(b.dire.ancientBottom).toBe(true)
  })

  it('mixes both dialects in one match without double-counting', () => {
    const b = buildingDecoder(
      ...(Object.values(
        replayBuildings(
          [
            ev('tower', 600, liveTower('dire', 'top', 'tier1')),
            ev('tower', 1800, tower('dire', 'top', 'T2')),
          ],
          3000,
        ),
      ) as [number, number]),
    )
    expect(b.dire.top.tier1).toBe(false)
    expect(b.dire.top.tier2).toBe(false)
    expect(b.dire.top.tier3).toBe(true)
  })

  it('handles barracks on their own bit range', () => {
    const { towerState, barracksState } = replayBuildings(
      [ev('barracks', 100, rax('radiant', 'bot', 'melee')), ev('barracks', 200, rax('radiant', 'bot', 'ranged'))],
      3000,
    )
    const b = buildingDecoder(towerState, barracksState)
    expect(b.radiant.bot.meleeRax).toBe(false)
    expect(b.radiant.bot.rangedRax).toBe(false)
    expect(b.radiant.top.meleeRax).toBe(true)
    expect(b.radiant.bot.tier3).toBe(true)
  })

  it('gives the two tier-4 towers a bit each', () => {
    // They share the "ancient" lane and are indistinguishable in the objective log, so
    // the first seen takes the first slot. Losing both must not read as losing one twice.
    const one = buildingDecoder(
      ...(Object.values(replayBuildings([ev('tower', 500, tower('dire', 'ancient', 'T4'))], 3000)) as [number, number]),
    )
    expect([one.dire.ancientTop, one.dire.ancientBottom].filter(Boolean)).toHaveLength(1)

    const both = buildingDecoder(
      ...(Object.values(
        replayBuildings(
          [ev('tower', 500, tower('dire', 'ancient', 'T4')), ev('tower', 520, tower('dire', 'ancient', 'T4'))],
          3000,
        ),
      ) as [number, number]),
    )
    expect(both.dire.ancientTop).toBe(false)
    expect(both.dire.ancientBottom).toBe(false)
  })

  it('skips events it cannot place instead of corrupting the mask', () => {
    const clean = replayBuildings([], 0)
    const noisy = replayBuildings(
      [
        ev('kill', 100, { killerSlot: 3 }),
        ev('tower', 200, { side: 'neither', lane: 'mid', tier: 'T1', kind: 'tower' }),
        ev('tower', 300, { side: 'dire', kind: 'tower' }),
        ev('roshan', 400, {}),
      ],
      3000,
    )
    expect(noisy).toEqual(clean)
  })
})

describe('finalItemsFrom', () => {
  const player = (slot: number, items: number[], neutral?: number) => ({
    player_slot: slot,
    ...Object.fromEntries(items.map((id, i) => [`item_${i}`, id])),
    ...(neutral ? { item_neutral: neutral } : {}),
  })

  /**
   * Items were the one thing a reconstructed match showed as ten rows of empty boxes, and
   * they were in the stored OpenDota body the whole time — just never read back.
   */
  it('reads the final six slots for both sides', () => {
    const m = finalItemsFrom({
      players: [player(0, [102, 1, 214, 232, 77, 218], 1864), player(128, [116, 1, 112, 50, 158, 137])],
    })
    expect(m.get(0)).toEqual({
      item0: 102, item1: 1, item2: 214, item3: 232, item4: 77, item5: 218, item_neutral: 1864,
    })
    // Dire's 128-132 maps onto the archive's 5-9, the same way the backfill does it.
    expect(m.get(5)).toMatchObject({ item0: 116, item5: 137 })
    expect(m.get(128)).toBeUndefined()
  })

  it('drops empty slots rather than showing item id 0', () => {
    const m = finalItemsFrom({ players: [player(1, [50, 0, 0, 0, 0, 0])] })
    expect(m.get(1)).toEqual({ item0: 50 })
  })

  it('returns nothing for a player who carried nothing', () => {
    expect(finalItemsFrom({ players: [player(2, [0, 0, 0, 0, 0, 0])] }).size).toBe(0)
  })

  it('survives a body with no players at all', () => {
    expect(finalItemsFrom(undefined).size).toBe(0)
    expect(finalItemsFrom({}).size).toBe(0)
    expect(finalItemsFrom({ players: 'nope' }).size).toBe(0)
  })
})
