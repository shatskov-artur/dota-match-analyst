# Phase 8: Ability Cooldowns & Map - Pattern Map

**Mapped:** 2026-04-28
**Files analyzed:** 11 (5 new, 6 modified/extended)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `shared/heroUltimates.json` | static-asset | lookup (id → name) | `shared/items.json` / `shared/heroes.json` | exact |
| `client/src/utils/heroUltimateMapper.ts` | utility | pure transform | `client/src/utils/itemMapper.ts` | exact |
| `client/src/utils/heroUltimateMapper.test.ts` | test | unit | `client/src/utils/itemMapper.test.ts` | exact |
| `client/src/utils/mapCoords.ts` | utility | pure transform | `shared/buildingDecoder.ts` (pure math) / `client/src/utils/formatNW.ts` | role-match |
| `client/src/utils/mapCoords.test.ts` | test | unit | `client/src/utils/formatNW.test.ts` | exact |
| `client/src/components/CooldownsBlock.tsx` | component | request-response (derive-from-props) | `client/src/components/ItemsBlock.tsx` | exact |
| `client/src/components/CooldownsBlock.test.tsx` | test | RTL render | `client/src/utils/itemMapper.test.ts` (Vitest convention) | role-match |
| `client/src/components/DotaMapView.tsx` (extend) | component | SVG render | self (existing file) | self-extension |
| `client/src/components/DotaMapView.test.tsx` | test | RTL render | (none — first DotaMapView test) | new |
| `server/src/schemas/valve.ts` (extend) | schema | validation | self — Phase 7 item-field additions | self-extension |
| `server/src/routes/live.ts` (extend) | route/BFF | request-response merge | self — Phase 7 item merge in `/games` | self-extension |
| `client/src/pages/MatchPage.tsx` (restructure) | page | composition | self — current bottom layout | self-extension |

---

## Pattern Assignments

### `shared/heroUltimates.json` (static-asset, lookup)

**Analog:** `shared/heroes.json` + `shared/items.json`

**Shape pattern** (mirror `heroes.json`'s flat id-keyed object):
```json
{
  "1": "antimage_mana_void",
  "2": "axe_culling_blade",
  "3": "bane_fiends_grip"
}
```

Same shape contract as `heroes.json` (`{ "<hero_id>": HeroInfo }`) — a flat record keyed by stringified hero_id. Single string value (ability name string used in CDN URL), not an object — minimal payload.

**Generation source:** `dotaconstants/hero_abilities.json` — last non-`generic_hidden` element of `abilities[]` per hero (per RESEARCH.md A1). Build script committed once; output JSON committed to repo.

---

### `client/src/utils/heroUltimateMapper.ts` (utility, pure transform)

**Analog:** `client/src/utils/itemMapper.ts` (lines 1-19, full file)

**Imports + lookup pattern** (copy verbatim, swap `items.json` → `heroUltimates.json`):
```typescript
// Browser-safe — uses Vite native JSON import instead of Node.js createRequire.
import ults from '../../../shared/heroUltimates.json'

/**
 * Maps a Valve hero_id to the ultimate ability name string (CDN URL slug).
 * Returns null for unknown IDs — never throws.
 */
export function heroUltimateMapper(heroId: number): string | null {
  return (ults as Record<string, string>)[String(heroId)] ?? null
}

export function heroUltimateIconUrl(heroId: number): string | null {
  const name = heroUltimateMapper(heroId)
  return name
    ? `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/${name}.png`
    : null
}
```

**Conventions enforced by analog:**
- String-coerce numeric id (`String(id)`) for record key — JSON keys are always strings.
- `null` (not `undefined`, not throw) on miss — UI components branch on truthy for fallback rendering.
- No re-export from `shared/` — Vite-native import path (`../../../shared/...`) per analog comment "DO NOT import from shared/itemMapper.ts — that file uses createRequire (Node.js only)".

---

### `client/src/utils/heroUltimateMapper.test.ts` (test, unit)

**Analog:** `client/src/utils/itemMapper.test.ts` (lines 1-20, full file)

**Test structure** (Vitest, single-file describe + it pairs):
```typescript
import { describe, it, expect } from 'vitest'
import { heroUltimateMapper, heroUltimateIconUrl } from './heroUltimateMapper'

describe('heroUltimateMapper', () => {
  it('returns "antimage_mana_void" for hero id 1', () => {
    expect(heroUltimateMapper(1)).toBe('antimage_mana_void')
  })
  it('returns null for unknown hero id', () => {
    expect(heroUltimateMapper(999999)).toBeNull()
  })
})

describe('heroUltimateIconUrl', () => {
  it('returns full CDN URL for known id', () => {
    expect(heroUltimateIconUrl(1)).toBe(
      'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/antimage_mana_void.png'
    )
  })
  it('returns null for unknown id', () => {
    expect(heroUltimateIconUrl(999999)).toBeNull()
  })
})
```

Cover: known id → name + URL, unknown id → null, edge case (id 0 if applicable).

---

### `client/src/utils/mapCoords.ts` (utility, pure transform)

**Analog (role/style):** `shared/buildingDecoder.ts` — pure deterministic math; small surface; no I/O. Locally, `client/src/utils/formatNW.ts` is the closest "pure transform with named export" pattern.

**Pattern from RESEARCH.md §Pattern 3 (verified against real Valve coordinate sample):**
```typescript
const HALF = 8192
const SVG = 320

/**
 * Converts Valve world-space position_x/position_y (range ±8192, +Y=North)
 * to SVG 320×320 pixel space (origin top-left, +Y=down).
 * Clamps to ±HALF to defend against fountain corner offsets.
 */
export function normalizeMapCoords(valveX: number, valveY: number): { svgX: number; svgY: number } {
  const x = Math.max(-HALF, Math.min(HALF, valveX))
  const y = Math.max(-HALF, Math.min(HALF, valveY))
  const svgX = ((x + HALF) / (2 * HALF)) * SVG
  const svgY = (1 - (y + HALF) / (2 * HALF)) * SVG // Y-flip mandatory
  return { svgX, svgY }
}
```

**Convention from analog (`buildingDecoder.ts` style):** module-level constants in UPPER_SNAKE, pure single-export function, no side effects, JSDoc explaining the coordinate-system semantics.

---

### `client/src/utils/mapCoords.test.ts` (test, unit)

**Analog:** `client/src/utils/formatNW.test.ts` / `client/src/utils/itemMapper.test.ts` — Vitest unit-test pattern.

**Required coverage** (per RESEARCH.md §Validation Architecture SC8-04):
- `(0, 0)` → `(160, 160)` (map center)
- `(-8192, -8192)` (Radiant fountain bound) → `(0, 320)` (lower-left)
- `(8192, 8192)` (Dire fountain bound) → `(320, 0)` (upper-right)
- Out-of-range value (e.g. `(20000, -20000)`) — clamped, no NaN
- Y-axis flip sanity: positive valveY → smaller svgY (top of map)

---

### `client/src/components/CooldownsBlock.tsx` (component, derive-from-props)

**Analog:** `client/src/components/ItemsBlock.tsx` (lines 1-173, full file)

**Imports + props interface pattern** (lines 1-20):
```typescript
import { useState } from 'react'
import { heroMapper } from '../utils/heroMapper'
import { heroUltimateIconUrl } from '../utils/heroUltimateMapper'

interface CooldownPlayer {
  hero_id?: number
  account_id?: number
  team: 'radiant' | 'dire'
  ultimate_state?: number     // 0=unavail/dead, 1=ready, 2=cooldown, 3=charging
  ultimate_cooldown?: number
  [key: string]: unknown
}

interface CooldownsBlockProps {
  players: CooldownPlayer[]
}
```

**Empty-state unmount pattern** (line 62):
```typescript
export default function CooldownsBlock({ players }: CooldownsBlockProps) {
  const active = players
    .filter(p => p.ultimate_state != null && p.ultimate_state !== 1)
    .sort((a, b) => (a.ultimate_cooldown ?? 0) - (b.ultimate_cooldown ?? 0))

  if (active.length === 0) return null   // D-04 — fully unmounted, no placeholder
  // ...
}
```

Mirrors `ItemsBlock.tsx` line 62: `if (players.length === 0) return null`.

**Section header + container pattern** (lines 64-73):
```typescript
return (
  <div className="flex flex-col flex-1">
    <p
      className="text-[10px] uppercase tracking-[0.3em] font-bold mb-4"
      style={{ color: '#555555' }}
    >
      Cooldowns
    </p>
    <div className="flex flex-col justify-between flex-1">
      {active.map((p, i) => (...))}
    </div>
  </div>
)
```

Copy header style verbatim from ItemsBlock — same 10px uppercase tracking-[0.3em] color #555555 contract enforced by UI-SPEC.

**Row layout pattern** (ItemsBlock lines 91-103, copy hover + border):
```typescript
<div
  key={player.account_id ?? player.hero_id ?? index}
  className="flex items-center border-b"
  style={{
    minHeight: 44,                  // UI-SPEC §CooldownsBlock — 44px (vs ItemsBlock 52)
    borderColor: '#1e1e1e',
    gap: 8,
    transition: 'background 160ms ease',
  }}
  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#0f0f0f')}
  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
>
```

**Hero portrait cell pattern** (ItemsBlock lines 119-130) — copy with size adjustment:
```typescript
{heroInfo ? (
  <img
    src={heroInfo.portrait}
    alt={heroInfo.name}
    style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover' }}
  />
) : (
  <div style={{ width: 32, height: 32, borderRadius: 4, background: '#141414' }} />
)}
```

**Ability icon cell pattern** (mirror `ItemSlot` from ItemsBlock lines 25-59):
```typescript
function UltSlot({ heroId }: { heroId?: number }) {
  const url = heroId != null ? heroUltimateIconUrl(heroId) : null
  const [imgError, setImgError] = useState(false)
  const isEmpty = !url || imgError

  if (isEmpty) {
    return (
      <div
        style={{ width: 32, height: 32, borderRadius: 4, background: '#1a1a1a', border: '1px solid #2a2a2a', flexShrink: 0 }}
        aria-label="Empty ability slot"
      />
    )
  }
  return (
    <img
      src={url}
      alt="ultimate"
      width={32}
      height={32}
      style={{ width: 32, height: 32, borderRadius: 4, display: 'block', objectFit: 'cover', flexShrink: 0 }}
      onError={() => setImgError(true)}
    />
  )
}
```

**Onerror fallback contract:** identical to `ItemSlot` — local `useState(false)`, swap to placeholder div on error. Per RESEARCH.md Pitfall 5 (graceful fallback on shapeshifter heroes).

**Countdown number pattern** (UI-SPEC typography §Display 14px tabular-nums):
```typescript
<div style={{
  fontSize: 14, fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  color: '#e8e8e8',
}}>
  {player.ultimate_state === 0 ? '—' : `${Math.max(0, Math.round(player.ultimate_cooldown ?? 0))}`}
  <span style={{ fontSize: 12, color: '#555555' }}>s</span>
</div>
```

---

### `client/src/components/DotaMapView.tsx` (component, SVG render — EXTEND)

**Self-extension** of existing file (lines 1-106). Existing structure preserved; add new prop + new SVG children.

**Existing prop interface to extend** (lines 3-5):
```typescript
import type { BuildingState } from '@shared/buildingDecoder'

interface Props {
  buildings: BuildingState
  heroPositions?: HeroPosition[]    // NEW
}

interface HeroPosition {
  hero_id: number
  team: 'radiant' | 'dire'
  position_x: number
  position_y: number
}
```

**Existing `Dot` component pattern (lines 9-19)** — reference for new circle rendering style, but use `<image>`+`<clipPath>` instead per D-02:

```typescript
function Dot({ x, y, alive, team, r = 4 }: { ... }) {
  const color = alive ? team === 'radiant' ? '#4ade80' : '#ef4444' : '#1c1c1c'
  // ... drop-shadow filter
  return <circle cx={x} cy={y} r={r} fill={color} ... />
}
```

**Hero position append** (insert after line 99, before label `<text>` at line 102):

Pattern from RESEARCH.md §Pattern 4 — three layered SVG element groups (defs+clipPath, image, stroke circle), iterated three times to keep z-order correct:
```tsx
{heroPositions?.length ? (
  <>
    <defs>
      {heroPositions.map(h => {
        const { svgX, svgY } = normalizeMapCoords(h.position_x, h.position_y)
        return (
          <clipPath key={`cp-${h.hero_id}-${h.team}`} id={`cp-${h.hero_id}-${h.team}`}>
            <circle cx={svgX} cy={svgY} r={8} />
          </clipPath>
        )
      })}
    </defs>
    {heroPositions.map(h => {
      const portrait = heroMapper(h.hero_id)?.portrait
      const { svgX, svgY } = normalizeMapCoords(h.position_x, h.position_y)
      if (!portrait) return null
      return (
        <image key={`img-${h.hero_id}-${h.team}`}
          href={portrait}
          x={svgX - 8} y={svgY - 8} width={16} height={16}
          clipPath={`url(#cp-${h.hero_id}-${h.team})`}
          preserveAspectRatio="xMidYMid slice"
        />
      )
    })}
    {heroPositions.map(h => {
      const { svgX, svgY } = normalizeMapCoords(h.position_x, h.position_y)
      return (
        <circle key={`stroke-${h.hero_id}-${h.team}`}
          cx={svgX} cy={svgY} r={8} fill="none"
          stroke={h.team === 'radiant' ? '#4ade80' : '#ef4444'}
          strokeWidth={1.5}
        />
      )
    })}
  </>
) : null}
```

**ID collision rule** (RESEARCH.md Pitfall 6): clipPath IDs MUST suffix with team — `cp-${hero_id}-${team}` — for mirror-pick scrims.

**Z-order:** must be appended AFTER existing building `<Dot>` children (line 99) and BEFORE `<text>` labels (line 102) — heroes layer above buildings, below labels.

---

### `server/src/schemas/valve.ts` (schema, validation — EXTEND)

**Self-extension** of `PlayerSchema` (lines 6-37). Add four optional fields next to Phase 7 item fields. Keep `.passthrough()`.

**Existing Phase 7 additive pattern (lines 23-36)** — copy idiom verbatim:
```typescript
// Phase 7: item slots — all optional, absent during draft phase
item0: z.number().optional(),
item1: z.number().optional(),
// ...
item_neutral: z.number().optional(),
item6: z.number().optional(),
item7: z.number().optional(),
item8: z.number().optional(),
```

**Phase 8 addition** (insert before `.passthrough()` at line 37):
```typescript
// Phase 8: ability cooldowns + map positions — all optional, absent during draft.
// VERIFIED 2026-04-28: field names are position_x / position_y (NOT x_pos / y_pos).
position_x: z.number().optional(),         // float, range ~±8192, centered at 0
position_y: z.number().optional(),         // float, range ~±8192, +Y = North (must Y-flip for SVG)
ultimate_state: z.number().int().optional(), // 0=unavail/dead, 1=ready, 2=cooldown, 3=charging
ultimate_cooldown: z.number().optional(),  // seconds remaining
```

**MUST preserve** the trailing `.passthrough()` (line 37) — per CLAUDE.md Critical Pitfalls.

---

### `server/src/routes/live.ts` (route/BFF, merge — EXTEND)

**Self-extension** of `liveRoutes.get('/games')` scoreboard merge (lines 72-98).

**Existing Phase 7 item-merge pattern (lines 72-98)** — copy idiom verbatim:
```typescript
const players = (g.players ?? []).map((p) => {
  const stats = p.account_id !== undefined ? statsByAccountId.get(p.account_id) : undefined
  if (!stats) return p
  return {
    ...p,
    kills: stats.kills ?? p.kills,
    // ... existing fields ...
    item0: stats.item0 ?? p.item0,
    // ... item1..item8, item_neutral ...
  }
})
```

**Phase 8 addition** — append to the spread object (after line 96, before closing `}` on line 97):
```typescript
position_x: stats.position_x ?? p.position_x,
position_y: stats.position_y ?? p.position_y,
ultimate_state: stats.ultimate_state ?? p.ultimate_state,
ultimate_cooldown: stats.ultimate_cooldown ?? p.ultimate_cooldown,
```

**Coalescing convention:** `stats.<field> ?? p.<field>` — scoreboard wins over top-level. Identical to every other field in this merge.

**No new route, no new cache key, no new TTL** — RESEARCH.md confirms this is purely additive on the existing `/api/live/games` cached at TTL=30s via `getLiveLeagueGames()`.

---

### `client/src/pages/MatchPage.tsx` (page, composition — RESTRUCTURE)

**Self-extension** — restructure existing two-section layout (lines 97-122) into the D-01 two-column layout.

**Existing layout to replace (lines 97-122):**
```tsx
{/* HeroPlayerGrid + ItemsBlock side by side */}
<div className="mt-12 flex gap-12 items-stretch">
  <HeroPlayerGrid radiantPlayers={...} direPlayers={...} isLoading={...} />
  {match?.game_state === 5 && radiantPlayers.length > 0 && (
    <div className="w-fit flex flex-col">
      <ItemsBlock players={[...].sort(...)} />
    </div>
  )}
</div>

{/* Map + buildings */}
{!buildings.unavailable && (
  <div className="mt-12 flex gap-8 items-start">
    <DotaMapView buildings={buildings} />
    <BuildingsSection buildings={buildings} />
  </div>
)}
```

**New two-column layout per D-01 + UI-SPEC §MatchPage Layout Restructure:**
```tsx
{/* Two-column block: left = HeroPlayerGrid + ItemsBlock; right = DotaMapView + CooldownsBlock */}
{match?.game_state === 5 && radiantPlayers.length > 0 && !buildings.unavailable && (
  <div className="mt-12 flex gap-4 items-stretch">
    {/* Left column */}
    <div className="flex flex-col flex-1 gap-8">
      <HeroPlayerGrid radiantPlayers={...} direPlayers={...} isLoading={...} />
      <ItemsBlock players={[...].sort(...)} />
    </div>
    {/* Right column — fixed 320px to match map width */}
    <div className="flex flex-col gap-8" style={{ width: 320 }}>
      <DotaMapView
        buildings={buildings}
        heroPositions={[
          ...radiantPlayers
            .filter(p => p.position_x != null && p.position_y != null && p.hero_id != null)
            .map(p => ({ hero_id: p.hero_id!, team: 'radiant' as const,
                         position_x: p.position_x!, position_y: p.position_y! })),
          ...direPlayers
            .filter(p => p.position_x != null && p.position_y != null && p.hero_id != null)
            .map(p => ({ hero_id: p.hero_id!, team: 'dire' as const,
                         position_x: p.position_x!, position_y: p.position_y! })),
        ]}
      />
      <CooldownsBlock players={[
        ...radiantPlayers.map(p => ({ ...p, team: 'radiant' as const })),
        ...direPlayers.map(p => ({ ...p, team: 'dire' as const })),
      ]} />
    </div>
  </div>
)}

{/* BuildingsSection — full-width row below the two-column block per UI-SPEC */}
{!buildings.unavailable && (
  <div className="mt-12">
    <BuildingsSection buildings={buildings} />
  </div>
)}
```

**Render-gate convention** (already established in current MatchPage): `match?.game_state === 5 && radiantPlayers.length > 0` — copy from existing line 104. `!buildings.unavailable` — copy from existing line 117.

---

## Shared Patterns

### Valve CDN URL construction
**Source:** `client/src/components/ItemsBlock.tsx` line 51 (item icon) + `shared/heroes.json` portrait field
**Apply to:** `heroUltimateIconUrl()` and ability `<img>` slot in CooldownsBlock
```typescript
`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/${name}.png`
```
Same domain (`cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/`) used everywhere — no DNS/safelist change.

---

### Image `onError` fallback
**Source:** `client/src/components/ItemsBlock.tsx` lines 27, 56 — `useState(false)` + `onError={() => setImgError(true)}` + placeholder `<div>` with `#1a1a1a` bg + `#2a2a2a` border.
**Apply to:** `UltSlot` in CooldownsBlock; `<image>` in DotaMapView (no error fallback in SVG — broken image renders as empty area, acceptable per RESEARCH.md Pitfall 5).
```typescript
const [imgError, setImgError] = useState(false)
// ...
if (isEmpty) {
  return <div style={{ width: 32, height: 32, borderRadius: 4,
                       background: '#1a1a1a', border: '1px solid #2a2a2a', flexShrink: 0 }}
              aria-label="Empty ability slot" />
}
return <img src={url} ... onError={() => setImgError(true)} />
```

---

### Section header typography
**Source:** `client/src/components/ItemsBlock.tsx` lines 67-72; `client/src/components/HeroPlayerGrid.tsx` `ColHeaders` lines 23-30
**Apply to:** "Cooldowns" header in CooldownsBlock
```tsx
<p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-4"
   style={{ color: '#555555' }}>
  Cooldowns
</p>
```

---

### Row hover transition
**Source:** `client/src/components/ItemsBlock.tsx` lines 99-102
**Apply to:** every CooldownsBlock row
```typescript
style={{ transition: 'background 160ms ease' }}
onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#0f0f0f')}
onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
```

---

### Team color tokens
**Source:** `client/src/components/DotaMapView.tsx` line 13; `client/src/components/ItemsBlock.tsx` line 77
**Apply to:** hero circle stroke on minimap
```typescript
const teamColor = team === 'radiant' ? '#4ade80' : '#ef4444'
```

---

### zod additive-extension on Valve schemas
**Source:** `server/src/schemas/valve.ts` lines 23-36 (Phase 7 item fields added without removing `.passthrough()`)
**Apply to:** PlayerSchema for Phase 8 four new fields
**Rule:** new fields = `z.number().optional()` (or `.int().optional()` for enum-like states). NEVER remove `.passthrough()` — Valve adds fields silently per patch.

---

### Vite-native JSON import for browser-safe mappers
**Source:** `client/src/utils/heroMapper.ts` lines 1-3 + `client/src/utils/itemMapper.ts` lines 1-3
**Apply to:** `heroUltimateMapper.ts`
**Rule:** import `'../../../shared/<file>.json'` directly. NEVER import `shared/itemMapper.ts` etc. — those use `createRequire` (Node-only, breaks Vite bundle).

---

### Vitest unit-test convention
**Source:** `client/src/utils/itemMapper.test.ts` (full file) — `describe(name) { it(case) { expect(...) } }`
**Apply to:** all new `*.test.ts` and `*.test.tsx` files
**Pattern:** colocate test file next to source (`foo.ts` + `foo.test.ts`). One `describe` per exported function. Cover known case + null case + edge case.

---

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `client/src/components/DotaMapView.test.tsx` | RTL render test | No existing component-level `*.test.tsx` in `client/src/components/`. First component test in this repo — establish pattern from `itemMapper.test.ts` (Vitest API) plus standard `@testing-library/react` `render` + `screen.getByRole`. |

(Note: `CooldownsBlock.test.tsx` is also a new component test file but follows the same first-mover pattern as DotaMapView.test.tsx.)

---

## Metadata

**Analog search scope:**
- `client/src/components/` (19 files) — found `ItemsBlock.tsx`, `DotaMapView.tsx`, `HeroPlayerGrid.tsx`
- `client/src/utils/` (15 files) — found `itemMapper.ts`, `heroMapper.ts`, `formatNW.ts`
- `client/src/pages/` — `MatchPage.tsx`
- `client/src/hooks/` — `useMatchDetail.ts` (no extension needed; reuse confirmed)
- `server/src/schemas/` — `valve.ts`
- `server/src/routes/` — `live.ts`
- `shared/` — `heroes.json`, `items.json`, `buildingDecoder.ts`

**Files scanned:** ~12 (read in full or targeted)
**Pattern extraction date:** 2026-04-28

---

## PATTERN MAPPING COMPLETE

**Phase:** 08 - ability-cooldowns-map
**Files classified:** 12 (5 new, 6 self-extensions, 1 first-mover test file)
**Analogs found:** 11 / 12

### Coverage
- Files with exact analog: 8 (heroUltimates.json, heroUltimateMapper.ts/.test.ts, mapCoords.test.ts, CooldownsBlock.tsx, MatchPage layout, valve.ts schema, live.ts route)
- Files with role-match analog: 3 (mapCoords.ts, CooldownsBlock.test.tsx, DotaMapView extension)
- Files with no analog: 1 (DotaMapView.test.tsx — first component-level RTL test in repo)

### Key Patterns Identified
- ItemsBlock is the structural twin of CooldownsBlock — same row pattern, same ItemSlot/UltSlot fallback, same header typography, same hover transition. Differences are purely the data cells (item icons → ability icon + countdown + state label).
- DotaMapView extension is purely additive — three layered SVG groups (clipPath defs, image, stroke circle) appended after building Dots and before labels. Coordinate normalization lives in a separate pure helper (`mapCoords.ts`), not inside the component.
- Server changes are zero-architecture additions: 4 fields on PlayerSchema, 4 lines in the live.ts merge — both follow the exact Phase 7 item-field idiom. No new route, no new cache, no new hook.
- Static-asset → utility-mapper → component pattern (heroes.json → heroMapper.ts → consumers; items.json → itemMapper.ts → ItemsBlock) replicates 1:1 for heroUltimates.json → heroUltimateMapper.ts → CooldownsBlock + DotaMapView.

### Field-name correction enforced across patterns
**ALL plan code MUST use `position_x`/`position_y`** (not `x_pos`/`y_pos` from CONTEXT.md/ROADMAP.md). RESEARCH.md verified the real Valve field names against a live payload sample. Schema, BFF merge, client interface, and SVG normalization all carry this corrected name.

### File Created
`.planning/phases/08-ability-cooldowns-map/08-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can reference each analog file + line range directly when authoring per-wave plan actions.
