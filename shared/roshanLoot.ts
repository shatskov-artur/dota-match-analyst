// VERIFIED: patch 7.41 (2026-05-03) via Liquipedia /Roshan §"Consumable Drops"
// Item IDs reference shared/items.json: aegis=117, roshans_banner=1804, cheese=33, refresher_shard=260
// When Dota patches change loot, update both the table below and ROSHAN_LOOT_PATCH in lockstep.

export const ROSHAN_LOOT_PATCH = '7.41' as const

export const ROSHAN_LOOT: Record<number, readonly number[]> = {
  1: [117],                  // Aegis of the Immortal
  2: [117, 1804],            // Aegis + Roshan's Banner
  3: [117, 1804, 33, 260],   // Aegis + Banner + Cheese + Refresher Shard
} as const

/**
 * Returns the loot for a given Roshan kill number.
 * Kills 0 / negative → empty array.
 * Kills 4+ → same as kill 3 (Valve currently has no further differentiation in 7.41).
 */
export function lookupRoshanLoot(killNumber: number): readonly number[] {
  if (killNumber <= 0) return []
  if (killNumber >= 3) return ROSHAN_LOOT[3]
  return ROSHAN_LOOT[killNumber] ?? []
}
