// Browser-safe itemMapper — uses Vite native JSON import instead of Node.js createRequire.
// DO NOT import from shared/itemMapper.ts — that file uses createRequire (Node.js only, breaks Vite bundling).
import items from '../../../shared/items.json'

type ItemEntry = { id: number; img: string; dname?: string }

// Build reverse lookup once at module load — O(1) resolution per call.
const idToName: Record<number, string> = {}
for (const [name, entry] of Object.entries(items as Record<string, ItemEntry>)) {
  idToName[entry.id] = name
}

/**
 * Maps a Valve item_id to the item name string used to construct CDN icon URLs.
 * Returns null for id=0 (empty slot) or unknown IDs — never throws.
 */
export function itemMapper(id: number): string | null {
  return idToName[id] ?? null
}
