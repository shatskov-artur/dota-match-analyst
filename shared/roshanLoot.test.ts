import { describe, it, expect } from 'vitest'
import { lookupRoshanLoot, ROSHAN_LOOT_PATCH } from './roshanLoot'
import items from './items.json'

// Phase 9 Plan 09-01 Wave 0 — RED tests for shared/roshanLoot.ts
// Until plan 02 creates shared/roshanLoot.ts the imports above fail and the
// suite is RED. After plan 02 every assertion below must pass.
//
// Loot table (verified patch 7.41 — see 09-RESEARCH.md OQ-1 resolution):
//   Kill 1   → Aegis (117)
//   Kill 2   → Aegis (117) + Roshan's Banner (1804)
//   Kill 3+  → Aegis (117) + Roshan's Banner (1804) + Cheese (33) + Refresher Shard (260)
//
// Item IDs verified in shared/items.json (D-17 / 09-CONTEXT.md):
//   117=aegis, 33=cheese, 260=refresher_shard, 1804=roshans_banner

const AEGIS = 117
const BANNER = 1804
const CHEESE = 33
const REFRESHER_SHARD = 260

// Build a Set of every item id present in items.json for cross-validation.
const itemIdSet = new Set<number>()
for (const entry of Object.values(items as Record<string, { id: number }>)) {
  if (typeof entry?.id === 'number') {
    itemIdSet.add(entry.id)
  }
}

describe('lookupRoshanLoot (ROSH-02 — patch 7.41 loot table)', () => {
  it('returns [] for kill 0 (no kills yet)', () => {
    expect(lookupRoshanLoot(0)).toEqual([])
  })

  it('returns [Aegis] for kill 1', () => {
    expect(lookupRoshanLoot(1)).toEqual([AEGIS])
  })

  it("returns [Aegis, Roshan's Banner] for kill 2", () => {
    expect(lookupRoshanLoot(2)).toEqual([AEGIS, BANNER])
  })

  it("returns [Aegis, Banner, Cheese, Refresher Shard] for kill 3", () => {
    expect(lookupRoshanLoot(3)).toEqual([AEGIS, BANNER, CHEESE, REFRESHER_SHARD])
  })

  it('clamps to kill-3 loot for kill 5', () => {
    expect(lookupRoshanLoot(5)).toEqual([AEGIS, BANNER, CHEESE, REFRESHER_SHARD])
  })

  it('clamps to kill-3 loot for kill 99', () => {
    expect(lookupRoshanLoot(99)).toEqual([AEGIS, BANNER, CHEESE, REFRESHER_SHARD])
  })

  it('returns [] for negative kill numbers (defensive)', () => {
    expect(lookupRoshanLoot(-1)).toEqual([])
  })
})

describe('ROSHAN_LOOT_PATCH version constant', () => {
  it("is the literal string '7.41'", () => {
    expect(ROSHAN_LOOT_PATCH).toBe('7.41')
  })
})

describe('Loot table cross-validation against shared/items.json', () => {
  it('every loot id for kills 1..5 is present in items.json', () => {
    for (const kill of [1, 2, 3, 4, 5]) {
      const loot = lookupRoshanLoot(kill)
      for (const id of loot) {
        expect(
          itemIdSet.has(id),
          `Kill ${kill}: item id ${id} missing from items.json`,
        ).toBe(true)
      }
    }
  })
})
