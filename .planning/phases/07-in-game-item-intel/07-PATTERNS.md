# Phase 7: In-Game Item Intel — Pattern Map

**Mapped:** 2026-04-28
**Files analyzed:** 7 (5 new, 2 modified)
**Analogs found:** 7 / 7

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `shared/items.json` | config | static | `shared/heroes.json` | exact |
| `shared/itemMapper.ts` | utility | transform | `shared/heroMapper.ts` | exact |
| `client/src/utils/itemMapper.ts` | utility | transform | `client/src/utils/heroMapper.ts` | exact |
| `client/src/utils/formatNW.ts` | utility | transform | `client/src/utils/formatGoldDiff.ts` | role-match |
| `client/src/components/ItemsBlock.tsx` | component | request-response | `client/src/components/HeroPlayerGrid.tsx` + `PlayerRow.tsx` | role-match |
| `server/src/schemas/valve.ts` | model | — | self (extend `PlayerSchema`) | exact |
| `client/src/pages/MatchPage.tsx` | component | request-response | self (insert after HeroPlayerGrid) | exact |

---

## Pattern Assignments

### `shared/items.json` (config, static)

**Analog:** `shared/heroes.json`

**Structure pattern** (`shared/heroes.json` lines 1-22):
```json
{
  "1": {
    "name": "Anti-Mage",
    "portrait": "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/antimage.png"
  },
  "2": {
    "name": "Axe",
    "portrait": "..."
  }
}
```

**items.json DIFFERS in key format:** Keys are item name strings (not numeric IDs), matching the OpenDota `/constants/items` response shape:
```json
{
  "blink": {
    "id": 1,
    "img": "/apps/dota2/images/dota_react/items/blink.png?t=1593393829403",
    "dname": "Blink Dagger",
    "qual": "component",
    "cost": 2250
  },
  "radiance": {
    "id": 119,
    "img": "/apps/dota2/images/dota_react/items/radiance.png?t=...",
    "dname": "Radiance"
  }
}
```

Acquired once: `curl -s "https://api.opendota.com/api/constants/items" > shared/items.json` — commit as static file, do not fetch at runtime.

---

### `shared/itemMapper.ts` (utility, transform — Node.js / server)

**Analog:** `shared/heroMapper.ts` (exact match — same `createRequire` pattern)

**Full file pattern** (`shared/heroMapper.ts` lines 1-19):
```typescript
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
 */
export function heroMapper(id: number): HeroInfo | null {
  return heroes[String(id)] ?? null
}
```

**itemMapper adaptation** — build a reverse-lookup (items.json is keyed by name, not id):
```typescript
import { createRequire } from 'module'

type ItemEntry = { id: number; img: string; dname: string }

const require = createRequire(import.meta.url)
const items = require('./items.json') as Record<string, ItemEntry>

// Build reverse lookup once at module load — O(1) resolution per call
const idToName: Record<number, string> = {}
for (const [name, entry] of Object.entries(items)) {
  idToName[entry.id] = name
}

/**
 * Maps a Valve item_id to the item name string used in CDN icon URLs.
 * Returns null for unknown IDs and id=0 (empty slot) — never throws.
 */
export function itemMapper(id: number): string | null {
  return idToName[id] ?? null
}
```

**Critical:** Do NOT use `heroes[String(id)]` lookup pattern from heroMapper — items.json is name-keyed, so a reverse-lookup loop is required at module init.

---

### `client/src/utils/itemMapper.ts` (utility, transform — browser / Vite)

**Analog:** `client/src/utils/heroMapper.ts` (exact match — same Vite JSON import pattern)

**Full file pattern** (`client/src/utils/heroMapper.ts` lines 1-17):
```typescript
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
```

**itemMapper adaptation** — same Vite JSON import, but with reverse-lookup (keyed by name not id):
```typescript
// Browser-safe itemMapper — uses Vite native JSON import instead of Node.js createRequire.
// DO NOT import from shared/itemMapper.ts — that file uses createRequire (Node.js only, breaks Vite).
import items from '../../../shared/items.json'

type ItemEntry = { id: number; img: string; dname: string }

// Build reverse lookup once at module load — O(1) resolution per call
const idToName: Record<number, string> = {}
for (const [name, entry] of Object.entries(items as Record<string, ItemEntry>)) {
  idToName[entry.id] = name
}

/**
 * Maps a Valve item_id to item name string (used to construct CDN icon URL).
 * Returns null for id=0 (empty slot) or unknown IDs — never throws.
 */
export function itemMapper(id: number): string | null {
  return idToName[id] ?? null
}
```

**Warning:** Never use `createRequire` in this file — Vite bundler will fail. Follow heroMapper's Vite JSON import exactly.

---

### `client/src/utils/formatNW.ts` (utility, transform)

**Analog:** `client/src/utils/formatGoldDiff.ts` (role-match — same single-purpose number formatter pattern)

**Analog pattern** (`client/src/utils/formatGoldDiff.ts` lines 1-20):
```typescript
export type GoldDiffResult = {
  text: string
  color: '#4ade80' | '#ef4444' | '#303030'
}

const fmt = new Intl.NumberFormat('en-US')

export function formatGoldDiff(radiantNW: number, direNW: number): GoldDiffResult {
  const diff = radiantNW - direNW
  if (diff === 0) return { text: '±0', color: '#303030' }
  if (diff > 0) return { text: `+${fmt.format(diff)}`, color: '#4ade80' }
  return { text: `−${fmt.format(Math.abs(diff))}`, color: '#ef4444' }
}
```

**formatNW pattern** — simpler: single value → abbreviated string:
```typescript
// client/src/utils/formatNW.ts
export function formatNW(value: number | undefined): string {
  if (value === undefined) return '—'
  if (value >= 1000) return (value / 1000).toFixed(1) + 'k'
  return value.toString()
}
// Examples: 12400 → "12.4k", 850 → "850", undefined → "—"
```

Note: formatGoldDiff uses `Intl.NumberFormat` for comma-separated large numbers and includes color info. formatNW only needs abbreviated k-notation with no color return — simpler signature.

---

### `client/src/components/ItemsBlock.tsx` (component, request-response)

**Analog 1:** `client/src/components/HeroPlayerGrid.tsx` — outer wrapper, section header, team-color label pattern

**Analog 2:** `client/src/components/PlayerRow.tsx` — per-row layout, heroMapper usage, portrait rendering, missing-data guards

**Imports pattern** (`PlayerRow.tsx` lines 1-2, `HeroPlayerGrid.tsx` line 1):
```typescript
import { heroMapper } from '../utils/heroMapper'
import { hiddenProfile } from '@shared/hiddenProfile'
```

**ItemsBlock imports:**
```typescript
import { useState } from 'react'
import { heroMapper } from '../utils/heroMapper'
import { itemMapper } from '../utils/itemMapper'
import { formatNW } from '../utils/formatNW'
```

**Props interface pattern** (`HeroPlayerGrid.tsx` lines 4-16):
```typescript
interface HeroPlayerGridProps {
  radiantPlayers: Array<{
    account_id?: number; hero_id?: number; name?: string; team?: number
    kills?: number; death?: number; assists?: number; net_worth?: number
    ...
  }>
  direPlayers: Array<{ ... }>
  isLoading: boolean
}
```

**ItemsBlock receives pre-sorted cross-team array** (different from HeroPlayerGrid's split radiant/dire props):
```typescript
interface ItemsBlockProps {
  players: Array<{
    hero_id?: number
    account_id?: number
    team: 'radiant' | 'dire'
    net_worth?: number
    item0?: number; item1?: number; item2?: number
    item3?: number; item4?: number; item5?: number
    item_neutral?: number
    item6?: number; item7?: number; item8?: number
    [key: string]: unknown  // passthrough compatibility
  }>
}
```

**Section header color pattern** (`HeroPlayerGrid.tsx` lines 63-65, 71-72):
```typescript
<p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-2"
   style={{ color: '#4ade80' }}>Radiant</p>
// ...
<p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-2 mt-8"
   style={{ color: '#ef4444' }}>Dire</p>
```

**ItemsBlock section header** — single header, not split by team:
```typescript
<p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-4"
   style={{ color: '#555555' }}>Items</p>
```

**Row border and hover pattern** (`PlayerRow.tsx` lines 38-43):
```typescript
<div
  className="flex items-center gap-4 px-0 border-b"
  style={{ minHeight: 52, borderColor: '#1e1e1e', transition: 'background 160ms ease' }}
  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#0f0f0f')}
  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
>
```

**Portrait rendering pattern** (`PlayerRow.tsx` lines 44-56):
```typescript
<div className="relative shrink-0" style={{ width: 48 }}>
  {heroInfo ? (
    <img
      src={heroInfo.portrait}
      alt={heroInfo.name}
      className="w-12 h-12 object-cover rounded-sm"
      style={{ opacity: isDead ? 0.3 : 1 }}
    />
  ) : (
    <div className="w-12 h-12 rounded-sm" style={{ background: '#141414' }} />
  )}
</div>
```

**ItemSlot inline component** (copy from RESEARCH.md Pattern 7 — `onError` fallback to placeholder):
```typescript
function ItemSlot({ itemId, variant = 'main' }: { itemId?: number; variant?: 'main' | 'neutral' | 'backpack' }) {
  const name = itemId && itemId !== 0 ? itemMapper(itemId) : null
  const [imgError, setImgError] = useState(false)
  const isEmpty = !name || imgError

  const style: React.CSSProperties = {
    width: 32, height: 32,
    borderRadius: 4,
    flexShrink: 0,
    ...(variant === 'neutral' ? { opacity: 0.75, border: '1px solid #888866' } : {}),
  }

  if (isEmpty) {
    return (
      <div
        style={{ ...style, background: '#1a1a1a', border: '1px solid #2a2a2a' }}
        aria-label="Empty item slot"
      />
    )
  }

  return (
    <img
      src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${name}.png`}
      alt={name}
      width={32}
      height={32}
      style={{ ...style, display: 'block', objectFit: 'cover' }}
      onError={() => setImgError(true)}
    />
  )
}
```

**Key lookup pattern** (`HeroPlayerGrid.tsx` line 68):
```typescript
<PlayerRow key={p.account_id ?? p.hero_id ?? p.name} player={p} ... />
```

ItemsBlock equivalent: `key={p.account_id ?? p.hero_id}` — no name field in props.

---

### `server/src/schemas/valve.ts` — extend `PlayerSchema` (model, modified)

**Analog:** Self — extend existing `PlayerSchema` following the established optional field comment pattern

**Current tail of PlayerSchema** (`server/src/schemas/valve.ts` lines 17-23):
```typescript
    // D-08: optional extended stats — present in-game via .passthrough(), absent during draft
    level: z.number().optional(),
    gpm: z.number().optional(),
    xpm: z.number().optional(),
    lh: z.number().optional(),     // last hits
    dn: z.number().optional(),     // denies
  })
  .passthrough()
```

**Extension to add after `dn`:**
```typescript
    // Phase 7: item slots — all optional, absent during draft phase
    item0: z.number().optional(),
    item1: z.number().optional(),
    item2: z.number().optional(),
    item3: z.number().optional(),
    item4: z.number().optional(),
    item5: z.number().optional(),
    item_neutral: z.number().optional(), // VERIFY field name at runtime (D-04)
    item6: z.number().optional(),        // backpack slot — VERIFY presence (D-04)
    item7: z.number().optional(),
    item8: z.number().optional(),
  })
  .passthrough()
```

**Pattern rule:** Every new field is `z.number().optional()`. Keep `.passthrough()` — never remove.

---

### `client/src/pages/MatchPage.tsx` — insert ItemsBlock (component, modified)

**Analog:** Self — insertion follows the same `{draft.scoreboard && (...)}` guard pattern already used for DraftSection

**Existing guard pattern** (`MatchPage.tsx` lines 84-94):
```typescript
{draft.scoreboard && (
  <DraftSection
    scoreboard={draft.scoreboard}
    gameState={draft.gameState}
    activeTeam={draft.activeTeam}
    action={draft.action}
    tentative={draft.tentative}
    heroStatsMap={heroStatsMap}
    playerIntelMap={playerIntelMap}
  />
)}
```

**HeroPlayerGrid block** (`MatchPage.tsx` lines 96-103 — insertion point immediately after):
```typescript
{/* HeroPlayerGrid — D-01 section order step 3; D-05 merged widget */}
<div className="mt-12">
  <HeroPlayerGrid
    radiantPlayers={radiantPlayers}
    direPlayers={direPlayers}
    isLoading={isLoading}
  />
</div>
```

**ItemsBlock insertion block** (insert between HeroPlayerGrid div and Map/buildings block):
```typescript
{/* ItemsBlock — Phase 7 D-01: cross-team NW sort, item icons */}
{draft.scoreboard && (
  <div className="mt-12">
    <ItemsBlock
      players={[
        ...(draft.scoreboard.radiant?.players ?? []).map(p => ({ ...p, team: 'radiant' as const })),
        ...(draft.scoreboard.dire?.players ?? []).map(p => ({ ...p, team: 'dire' as const })),
      ].sort((a, b) => ((b.net_worth as number) ?? 0) - ((a.net_worth as number) ?? 0))}
    />
  </div>
)}
```

**Import to add** (follow existing import block pattern, lines 1-13):
```typescript
import ItemsBlock from '../components/ItemsBlock'
```

---

## Shared Patterns

### Dark Theme Tokens
**Source:** `client/src/components/PlayerRow.tsx` (lines 38-55), `client/src/pages/MatchPage.tsx` (line 31)
**Apply to:** `ItemsBlock.tsx` all elements
```typescript
// Background: #0a0a0a (page), #0f0f0f (row hover), #141414 (portrait placeholder), #1a1a1a (slot bg)
// Text: #d8d8d8 (primary), #888888 (secondary), #555555 (section label)
// Borders: #1e1e1e (row dividers), #2a2a2a (slot border)
// Team colors: #4ade80 (radiant), #ef4444 (dire)
// Transition: 'background 160ms ease' on row hover
```

### Passthrough Rule
**Source:** `server/src/schemas/valve.ts` (line 24, line 82)
**Apply to:** All schema extensions in `valve.ts`
```typescript
.passthrough() // CRITICAL: never remove — Valve adds fields silently each patch
```

### Missing Data Guard
**Source:** `client/src/components/PlayerRow.tsx` (lines 27-35)
**Apply to:** `ItemsBlock.tsx` per-row rendering
```typescript
const heroInfo = player.hero_id !== undefined ? heroMapper(player.hero_id) : null
// Render placeholder div when heroInfo is null — never crash on missing data
```

### Image Fallback Pattern
**Source:** ItemSlot pattern (RESEARCH.md Pattern 7)
**Apply to:** All `<img>` tags for item icons in `ItemsBlock.tsx`
```typescript
const [imgError, setImgError] = useState(false)
// ...
onError={() => setImgError(true)}
// When imgError === true, render placeholder div instead of broken img
```

### Browser/Node Module Split
**Source:** `client/src/utils/heroMapper.ts` (Vite JSON import) vs `shared/heroMapper.ts` (createRequire)
**Apply to:** `client/src/utils/itemMapper.ts` and `shared/itemMapper.ts`
- Browser: `import items from '../../../shared/items.json'` — Vite handles
- Node.js: `const require = createRequire(import.meta.url); const items = require('./items.json')`
- NEVER mix — createRequire in browser context breaks Vite bundling

---

## No Analog Found

All files have close analogs in the codebase. No entries.

---

## Metadata

**Analog search scope:** `shared/`, `client/src/utils/`, `client/src/components/`, `client/src/pages/`, `server/src/schemas/`
**Files scanned:** 8 source files read directly
**Pattern extraction date:** 2026-04-28
