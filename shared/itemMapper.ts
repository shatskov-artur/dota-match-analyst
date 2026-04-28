import { createRequire } from 'module'

type ItemEntry = { id: number; img: string; dname: string }

// items.json is indexed by item name string (e.g. "blink", "radiance").
// Build reverse lookup (id -> name) once at module load for O(1) resolution per call.
const require = createRequire(import.meta.url)
const items = require('./items.json') as Record<string, ItemEntry>

const idToName: Record<number, string> = {}
for (const [name, entry] of Object.entries(items)) {
  idToName[entry.id] = name
}

/**
 * Maps a Valve item_id to the item name string used to construct CDN icon URLs.
 * Returns null for id=0 (empty slot) or unknown IDs — never throws.
 * Browser-side equivalent: client/src/utils/itemMapper.ts (Vite JSON import pattern).
 * DO NOT import this file in browser context — createRequire is Node.js only.
 */
export function itemMapper(id: number): string | null {
  return idToName[id] ?? null
}
