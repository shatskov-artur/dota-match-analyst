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
