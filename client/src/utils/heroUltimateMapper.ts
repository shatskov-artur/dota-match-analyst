// Browser-safe heroUltimateMapper — uses Vite native JSON import (NOT Node.js createRequire).
// DO NOT import from any shared/heroUltimateMapper.ts — that pattern would break Vite bundling.
import ults from '../../../shared/heroUltimates.json'

/**
 * Maps a Valve hero_id to the ultimate ability name string used in CDN URLs.
 * Returns null for unknown IDs — never throws.
 */
export function heroUltimateMapper(heroId: number): string | null {
  const v = (ults as unknown as Record<string, string | string[]>)[String(heroId)]
  if (Array.isArray(v)) return v[0] ?? null // multi-form ultimates (e.g. Monkey King) — pick first
  return v ?? null
}

/**
 * Resolves a hero_id to a full Valve CDN ability icon URL, or null if the hero
 * has no mapped ultimate (e.g. shapeshifters / reworks per RESEARCH.md A1).
 */
export function heroUltimateIconUrl(heroId: number): string | null {
  const name = heroUltimateMapper(heroId)
  return name
    ? `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/${name}.png`
    : null
}
