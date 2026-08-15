// Browser-safe heroMapper — uses Vite native JSON import instead of Node.js createRequire.
// DO NOT import from @shared/heroMapper — that file uses createRequire (Node.js only, breaks Vite bundling).
import heroes from '../../../shared/heroes.json'

export interface HeroInfo {
  name: string
  portrait: string
}

/**
 * Maps a Valve hero_id to display name and portrait URL.
 * Returns null for unknown IDs or id === 0 — never throws.
 * Same signature as shared/heroMapper.ts — drop-in replacement for browser context.
 */
export function heroMapper(id: number): HeroInfo | null {
  return (heroes as Record<string, HeroInfo>)[String(id)] ?? null
}

/**
 * npc name → hero id, e.g. "npc_dota_hero_furion" → 53.
 *
 * OpenDota's kill log names the victim by npc name, and that is the only handle on the
 * victim there is — so without this the feed can print who died but not show their face.
 *
 * The lookup is built from the portrait filename, which IS the npc suffix: Nature's
 * Prophet is furion.png and npc_dota_hero_furion. Deriving it beats a second table that
 * would drift from the first.
 */
const idByNpcName = new Map<string, number>()
for (const [id, info] of Object.entries(heroes as Record<string, HeroInfo>)) {
  const slug = /heroes\/([^/]+)\.png/.exec(info.portrait)?.[1]
  if (slug) idByNpcName.set(`npc_dota_hero_${slug}`, Number(id))
}

export function heroIdFromNpcName(key: unknown): number | null {
  return typeof key === 'string' ? (idByNpcName.get(key) ?? null) : null
}
