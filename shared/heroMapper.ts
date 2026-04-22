import { createRequire } from 'module'

export interface HeroInfo {
  name: string
  portrait: string
}

// heroes.json is indexed by string keys (JSON object keys are always strings)
const require = createRequire(import.meta.url)
const heroes = require('./heroes.json') as Record<string, HeroInfo>

/**
 * Maps a Valve hero_id to display name and portrait URL.
 * Returns null for unknown IDs — never throws.
 * Per D-06: heroMapper(id: number) returns { name, portrait } | null.
 */
export function heroMapper(id: number): HeroInfo | null {
  return heroes[String(id)] ?? null
}
