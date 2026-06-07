# Phase 7: In-Game Item Intel — Research

**Researched:** 2026-04-28
**Domain:** Dota 2 live API item fields · static item mapping · React component insertion
**Confidence:** HIGH (all critical claims verified against live codebase and OpenDota API)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Items Block is a new separate section below HeroPlayerGrid on MatchPage. HeroPlayerGrid stays unchanged. Both sections visible simultaneously. Items Block uses cross-team NW sort.
- **D-02:** Bundle `shared/items.json` — same pattern as `shared/heroes.json`. One-time download from OpenDota `/constants/items`, committed as static file. Client imports via Vite JSON import, server imports directly. Icon URL: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/{name}.png`
- **D-03:** Row layout: rank# (team-colored) · hero portrait (48px) · NW · 6 item icons. Rank colored `#4ade80` Radiant / `#ef4444` Dire. NW formatted (e.g. `12.4k`).
- **D-04:** Show item0–item5 always. Neutral slot (`item_neutral`) as 7th slot if present. Backpack (`item6`–`item8`) as 3-slot group if present. VERIFY field names at implementation.
- **D-05:** Empty slot (item_id=0 or undefined) → dark placeholder square. No error state.
- **D-06:** Item fields in `scoreboard.{radiant,dire}.players[]`. Extend BFF or reuse scoreboard via passthrough. Simplest path: existing `/api/live/draft/:matchId` already returns full scoreboard — item fields pass through via `.passthrough()`.

### Claude's Discretion

- Exact item slot visual sizing (recommend 32–36px → resolved to 32px per UI-SPEC)
- Whether to add item fields explicitly to PlayerSchema or rely on `.passthrough()` (recommend explicit)
- Section header copy ("Items" or "Net Worth")
- CSS for empty slot placeholder
- Neutral slot visual distinction (opacity 0.75, faint gold border #888866)
- Whether `itemMapper.ts` in shared/ or client/src/utils/

### Deferred Ideas (OUT OF SCOPE)

- Item tooltips (hover shows item name/description)
- Item build progression / historical item tracking
- Item cost / power spike indicator
- Aghanim's Scepter/Shard special highlight (may add as cosmetic if trivial)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SC-01 | User sees all 10 heroes sorted descending by net worth in a dedicated block | `net_worth` field verified present in scoreboard players; merge+sort pattern documented |
| SC-02 | Each hero row shows 6 item icon slots (empty slot rendered as placeholder) | `item0`–`item5` pass through PlayerSchema via `.passthrough()`; CDN URL verified 200 OK |
| SC-03 | Items update on the same 30s polling cycle as the match screen | `useDraftDetail` already polls scoreboard; reuse via `draft.scoreboard` in MatchPage |
| SC-04 | Missing or unknown item IDs render as empty slot, not an error | `id=0` not in items.json (correct: empty slot); unknown IDs → null from itemMapper → placeholder |
</phase_requirements>

---

## Summary

Phase 7 adds a cross-team net-worth ranking block to MatchPage showing all 10 heroes with their equipped item icons. The implementation is largely additive: no existing components are modified, no new BFF routes are needed, and the data is already in-flight via `useDraftDetail`.

The critical data path is: `scoreboard.{radiant,dire}.players[]` already reaches the client through the existing `/api/live/draft/:matchId` route. Item fields (`item0`–`item5`, and potentially `item_neutral`, `item6`–`item8`) pass through `PlayerSchema.passthrough()` unchanged — they are present in the raw Valve API payload and flow through unchecked. The planner must verify exact neutral/backpack field names at runtime because the Valve documentation does not enumerate them (D-04 VERIFY note).

The items.json static file follows the exact same pattern as `shared/heroes.json`. The OpenDota `/constants/items` endpoint returns a JSON object keyed by item name string (e.g. `"blink"`, `"radiance"`), where each value contains `{ id, img, dname, ... }`. Building a reverse lookup `id → name` at module load time provides O(1) resolution. The CDN URL pattern `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/{name}.png` is verified working (HTTP 200).

**Primary recommendation:** Reuse `useDraftDetail` scoreboard data in MatchPage — no new hook, no new BFF route. New files: `shared/items.json`, `client/src/utils/itemMapper.ts`, `client/src/components/ItemsBlock.tsx`. Extend `PlayerSchema` with explicit item field declarations for type safety.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Item ID → name mapping | Client (static import) | Server (shared/items.json) | Identical pattern to heroMapper; Vite JSON import for browser, createRequire for Node |
| Item icon rendering | Browser / Client | CDN (Valve Steam CDN) | Icons are `<img>` tags pointing to Valve CDN — no server involvement |
| Player item data delivery | API / BFF | — | Valve scoreboard data passes through existing `/api/live/draft/:matchId` unchanged |
| Net-worth sort + team merge | Browser / Client | — | Pure client-side sort of already-fetched scoreboard arrays |
| Polling cadence | Browser / Client | — | Inherited from `useDraftDetail` — 30s in-game, false post-game; no new logic |

---

## Standard Stack

### Core (already in project — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | 19.x | ItemsBlock component | Project standard |
| TanStack Query v5 | 5.x | Data via `useDraftDetail` | Project standard — reuse existing hook |
| Tailwind 4 | 4.x | Layout utilities | Project standard — inline style for colors |
| Vite 6 | 6.x | JSON import (`shared/items.json`) | Same pattern as `heroes.json` |
| zod 3 | 3.x | PlayerSchema extension | Project standard |

### No New Dependencies

This phase introduces zero new npm packages. All libraries are already installed. The only new artifact fetched externally is `items.json` committed as a static file.

**Installation:** None required.

---

## Architecture Patterns

### System Architecture Diagram

```
Valve GetLiveLeagueGames API
        │
        ▼
server/src/services/valveApi.ts
  getLiveLeagueGamesFast()  [TTL.DRAFT = 4s cache]
        │
        ▼
server/src/routes/live.ts
  GET /api/live/draft/:matchId
  returns { match_id, game_state, scoreboard }
  scoreboard.{radiant,dire}.players[] includes item0-item5
  via PlayerSchema.passthrough() — item fields are untyped but present
        │
        ▼ (HTTP, existing 30s poll from useDraftDetail)
client/src/hooks/useDraftDetail.ts
  draft.scoreboard.radiant.players[]  ← item0-item5 present in [key: string]: unknown
  draft.scoreboard.dire.players[]
        │
        ▼ (MatchPage.tsx — new insertion point)
  merge radiant + dire players, inject team:'radiant'|'dire'
  sort by net_worth descending
        │
        ▼
client/src/components/ItemsBlock.tsx
  renders 10 hero rows sorted by NW
        │
        ├─→ heroMapper(hero_id) → portrait URL [existing]
        ├─→ itemMapper(item_id) → item name string [NEW]
        │         ↑
        │   shared/items.json  [NEW static file]
        │         reverse lookup: id → key name
        │
        └─→ <img src="https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/{name}.png" />
                or empty slot placeholder div (item_id === 0 or unknown)
```

### Recommended Project Structure

```
shared/
├── heroes.json          # existing
├── heroMapper.ts        # existing
├── items.json           # NEW — downloaded once from OpenDota /constants/items
└── itemMapper.ts        # NEW — server-side mapper (Node.js createRequire pattern)

client/src/
├── utils/
│   ├── heroMapper.ts    # existing (Vite JSON import pattern)
│   ├── itemMapper.ts    # NEW — browser mapper (Vite JSON import pattern)
│   └── formatNW.ts      # NEW — small utility (value >= 1000 → "12.4k")
└── components/
    └── ItemsBlock.tsx   # NEW — main component + inline ItemSlot

server/src/schemas/
└── valve.ts             # EXTEND PlayerSchema with item0-item5, item_neutral, item6-item8
```

### Pattern 1: items.json Structure (verified from OpenDota API live call 2026-04-28)

```json
{
  "blink": {
    "id": 1,
    "img": "/apps/dota2/images/dota_react/items/blink.png?t=1593393829403",
    "dname": "Blink Dagger",
    "qual": "component",
    "cost": 2250,
    ...
  },
  "radiance": {
    "id": 119,
    "img": "/apps/dota2/images/dota_react/items/radiance.png?t=...",
    "dname": "Radiance",
    ...
  }
}
```

Keys are item name strings (no `item_` prefix). Total items: 501. Item ID=0 is NOT present (correct: 0 means empty slot).

### Pattern 2: itemMapper (browser — Vite JSON import)

```typescript
// Source: mirrors client/src/utils/heroMapper.ts exactly
import items from '../../../shared/items.json'

type ItemEntry = { id: number; img: string; dname: string }

// Build reverse lookup once at module load — O(1) resolution per call
const idToName: Record<number, string> = {}
for (const [name, entry] of Object.entries(items as Record<string, ItemEntry>)) {
  idToName[entry.id] = name
}

export function itemMapper(id: number): string | null {
  return idToName[id] ?? null
}
```

### Pattern 3: items.json for Server (Node.js createRequire)

```typescript
// Source: mirrors shared/heroMapper.ts exactly
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const items = require('./items.json') as Record<string, { id: number; img: string; dname: string }>

const idToName: Record<number, string> = {}
for (const [name, entry] of Object.entries(items)) {
  idToName[entry.id] = name
}

export function itemMapper(id: number): string | null {
  return idToName[id] ?? null
}
```

### Pattern 4: PlayerSchema Extension

```typescript
// In server/src/schemas/valve.ts — extend PlayerSchema
const PlayerSchema = z.object({
  // ... existing fields ...
  // Phase 7: item slots — all optional, absent during draft phase
  item0: z.number().optional(),
  item1: z.number().optional(),
  item2: z.number().optional(),
  item3: z.number().optional(),
  item4: z.number().optional(),
  item5: z.number().optional(),
  item_neutral: z.number().optional(), // VERIFY field name at runtime
  item6: z.number().optional(),        // backpack slot — VERIFY presence
  item7: z.number().optional(),
  item8: z.number().optional(),
}).passthrough()
```

### Pattern 5: CDN Icon URL Construction

```typescript
// VERIFIED: CDN returns HTTP 200 for known item names
// img field in items.json is a relative path: /apps/dota2/images/dota_react/items/{name}.png?t=...
// CDN base: https://cdn.cloudflare.steamstatic.com

function itemIconUrl(itemName: string): string {
  // Strip query string from img field — timestamp is irrelevant for browser caching
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${itemName}.png`
}
```

### Pattern 6: MatchPage Integration

```tsx
// In client/src/pages/MatchPage.tsx — after HeroPlayerGrid block
// draft.scoreboard is already available from useDraftDetail()

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

Note: `draft.scoreboard` is only present when scoreboard data is available (in-game). This naturally hides ItemsBlock during draft phase (no item data exists yet). Same condition as D-06 specifies.

### Pattern 7: ItemSlot Rendering

```tsx
// Inline inside ItemsBlock.tsx — see UI-SPEC §ItemSlot
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

### Anti-Patterns to Avoid

- **Fetching items.json at runtime:** Never call OpenDota `/constants/items` on user request. Commit the file as a static artifact — same rationale as `heroes.json`.
- **Using `img` field URL directly from items.json:** The img field includes a `?t=` cache-busting timestamp. Strip it or use the key-name pattern (`/items/{name}.png`) to avoid unnecessary cache misses.
- **Reading item fields from top-level `players[]`:** The top-level players array in `/api/live/games` only carries account_id, hero_id, name, team + merged stats. Item fields are only in `scoreboard.{radiant,dire}.players[]` — accessed via `useDraftDetail`, not `useMatchDetail`.
- **Sorting inside ItemsBlock:** Pre-sort before passing to the component. ItemsBlock receives a pre-sorted array and renders it — no internal sort.
- **Creating a new polling hook:** `useDraftDetail` already polls scoreboard at 30s in-game. ItemsBlock consumes the same `draft.scoreboard` data — no new TanStack Query key needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Item ID → name lookup | Custom fetch at runtime | `shared/items.json` + reverse lookup | Same pattern as heroes.json — proven, zero runtime cost |
| Icon load failure | Error UI / console warning | `<img onError>` → replace with placeholder div | Standard browser pattern; silent fallback is the spec |
| NW formatting | Inline ternary everywhere | `formatNW(value)` utility | Reusable; testable; consistent with `formatGoldDiff` precedent |
| Polling | New useQuery with queryKey | Reuse `useDraftDetail` scoreboard | useDraftDetail already polls at the correct cadence |
| CDN URL | Store full URL in items.json | Construct from item name key | items.json already has consistent key names; URL pattern verified |

---

## Critical Data Path Verification

### items.json Verified Facts (VERIFIED via live OpenDota API call 2026-04-28)

| Fact | Verified Value |
|------|---------------|
| Endpoint | `https://api.opendota.com/api/constants/items` |
| Total items | 501 |
| Key format | item name string, no `item_` prefix (e.g. `"blink"`, `"radiance"`) |
| Key → id mapping | `obj[key].id` is a number |
| ID=0 in file | NOT present — correct (0 = empty slot) |
| img field format | Relative path: `/apps/dota2/images/dota_react/items/{name}.png?t=...` |
| CDN base | `https://cdn.cloudflare.steamstatic.com` |
| CDN URL HTTP status | 200 (verified for `blink.png`) |
| Recipe items | Present (e.g. `recipe_arcane_blink`, id=606) — will render if equipped (unlikely) |
| Neutral items (qual=neutral) | Only tier tokens (2091–2095) and ~10 others — actual equippable neutrals use standard item IDs |
| Keys with `item_` prefix | 0 — no item_ prefix on any key |

### CDN URL Pattern (VERIFIED)

Two equivalent constructions — use name-based:
```
https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/{name}.png
```
where `{name}` is the key from items.json (e.g. `blink`, `radiance`, `black_king_bar`).

Do NOT include `?t=` timestamp — it is irrelevant for browser caching and adds noise.

### PlayerSchema Passthrough (VERIFIED by reading valve.ts)

Current `PlayerSchema` does NOT declare item fields explicitly. They are present in the raw Valve API payload and pass through via `.passthrough()` on `PlayerSchema`, `TeamScoreboardSchema`, and `ScoreboardSchema`. However, the TypeScript type `z.infer<typeof PlayerSchema>` will type them as `unknown` without explicit declaration. The plan SHOULD add explicit declarations for type safety (Claude's Discretion).

### useDraftDetail Data Availability (VERIFIED by reading hook)

`useDraftDetail` returns `{ scoreboard, gameState, ... }`. The scoreboard includes raw Valve data with item fields passing through as `[key: string]: unknown`. MatchPage can access:
```typescript
const draft = useDraftDetail(matchId)
draft.scoreboard?.radiant?.players  // Array — each player has item0-item5 as unknown
draft.scoreboard?.dire?.players
```
These arrays are the correct source for item data (not `radiantPlayers`/`direPlayers` from `useMatchDetail`).

### MatchPage Insertion (VERIFIED by reading MatchPage.tsx lines 96–111)

Current structure:
```tsx
{/* HeroPlayerGrid — line 97 */}
<div className="mt-12">
  <HeroPlayerGrid ... />
</div>

{/* Map + buildings — line 106 */}
{!buildings.unavailable && (
  <div className="mt-12 flex gap-8 items-start">
    ...
  </div>
)}
```

ItemsBlock inserts between these two blocks. The `draft` object is already available in MatchPage scope from the existing `useDraftDetail(matchId)` call on line 9.

---

## Common Pitfalls

### Pitfall 1: item_neutral Field Name Unknown
**What goes wrong:** Rendering logic hard-codes `item_neutral` but Valve uses a different field name in live payloads — slot renders empty for all games.
**Why it happens:** Valve API documentation does not enumerate neutral item slot field names. CONTEXT.md explicitly marks this as VERIFY.
**How to avoid:** In the plan's Wave 0 or Wave 1, add a verification task: inspect a real live API payload during an in-game match to confirm `item_neutral` vs `item5` overlap vs no neutral field at all. The D-04 decision explicitly says: "If absent, render only 6 main slots with no error."
**Warning signs:** itemMapper always returns null for the 7th slot.

### Pitfall 2: Reading Items from Wrong Player Array
**What goes wrong:** ItemsBlock receives players from `useMatchDetail` (`radiantPlayers`/`direPlayers`) which are the top-level enriched players. These have KDA/NW merged in but NOT item fields — item fields only exist in `scoreboard.{radiant,dire}.players[]`.
**Why it happens:** live.ts `/api/live/games` route merges scoreboard stats into top-level players (lines 72–91) but only copies kills, death, assists, net_worth, level, respawn_timer, gpm, xpm, lh, dn. Item fields are NOT copied.
**How to avoid:** ItemsBlock MUST read from `draft.scoreboard.radiant.players` and `draft.scoreboard.dire.players` — not from `useMatchDetail`'s `radiantPlayers`.
**Warning signs:** All item slots empty despite data being present.

### Pitfall 3: items.json img Field Query String
**What goes wrong:** Using `items[name].img` directly as the CDN URL creates URLs like `.../blink.png?t=1593393829403` — the timestamp was valid in 2020 and may differ from what the current CDN serves.
**Why it happens:** items.json img field includes a legacy cache-busting timestamp.
**How to avoid:** Construct icon URL from the key name: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${name}.png` (no query string). CDN verified 200 OK without timestamp.
**Warning signs:** Broken images in some environments.

### Pitfall 4: Browser vs Node.js itemMapper Import
**What goes wrong:** Using `import { createRequire } from 'module'` in browser-side `client/src/utils/itemMapper.ts` causes Vite to fail bundling.
**Why it happens:** The shared heroMapper uses `createRequire` (Node.js only). The browser heroMapper in `client/src/utils/heroMapper.ts` uses Vite native JSON import instead.
**How to avoid:** Create TWO itemMapper files following exact same split as heroMapper: `shared/itemMapper.ts` (createRequire, Node.js) and `client/src/utils/itemMapper.ts` (Vite JSON import). See Pattern 2 and 3 above.
**Warning signs:** Vite build error mentioning `createRequire` or `module` in browser context.

### Pitfall 5: Sorting During Render (Performance)
**What goes wrong:** Sorting 10 players on every render inside ItemsBlock causes unnecessary re-computation when parent re-renders.
**Why it happens:** Temptation to sort inside the component.
**How to avoid:** Pre-sort in MatchPage before passing the array as a prop. ItemsBlock renders a sorted array — it never sorts internally.
**Warning signs:** Visible sort flicker on hover (parent re-render triggers re-sort).

### Pitfall 6: items.json Staleness After Major Patch
**What goes wrong:** New items added in a Dota 2 patch are not in the committed items.json — they render as empty slots.
**Why it happens:** items.json is a one-time snapshot, not live-fetched.
**How to avoid:** Document in plan comments that items.json requires manual refresh at each major Dota 2 patch (typically every 2-3 months). Per D-02 this is accepted behavior — "infrequent updates" and "empty slot" is the correct fallback. Not a bug.
**Warning signs:** New item renders as empty — expected behavior, not a crash.

---

## Code Examples

### items.json Acquisition (one-time, at plan time)

```bash
# Download from OpenDota API and commit
curl -s "https://api.opendota.com/api/constants/items" > shared/items.json
```

The downloaded file is ~200KB and contains 501 items as of 2026-04-28. Commit alongside implementation.

### formatNW Utility

```typescript
// client/src/utils/formatNW.ts — new small utility
export function formatNW(value: number | undefined): string {
  if (value === undefined) return '—'
  if (value >= 1000) return (value / 1000).toFixed(1) + 'k'
  return value.toString()
}
// Examples: 12400 → "12.4k", 850 → "850", undefined → "—"
```

### ItemsBlock Props Interface

```typescript
// From 07-UI-SPEC.md — verified matches scoreboard.players[] shape
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

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Item ID lookup at runtime (API call) | Static JSON bundle (committed) | Zero latency, zero rate limit risk |
| Custom CDN URL per item | Key-based URL construction from items.json | Consistent, no timestamp issues |
| Hero portrait only in PlayerRow | Hero portrait + item strip in ItemsBlock | Richer in-game view |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `item_neutral` is the Valve API field name for the neutral item slot | Patterns §PlayerSchema Extension | Neutral slot always renders empty; D-04 says render only 6 main slots with no error — safe fallback |
| A2 | `item6`–`item8` are the backpack slot field names in live API | Patterns §PlayerSchema Extension | Backpack group not rendered; D-04 says show if present — safe to omit |
| A3 | Item fields (`item0`–`item5`) are currently passing through `PlayerSchema.passthrough()` to `useDraftDetail` | Critical Data Path §PlayerSchema Passthrough | Items not available to client; would require BFF route change |
| A4 | Actual equippable neutral items (tier 1-5) use standard item IDs that ARE present in items.json | items.json Verified Facts | Neutral items render as empty slots even when equipped — acceptable per success criteria #4 |

Assumptions A1 and A2 are explicitly marked VERIFY in CONTEXT.md §D-04 and ROADMAP.md §Phase 7. Assumption A3 is HIGH confidence based on verified code reading of `PlayerSchema` + `TeamScoreboardSchema` + live.ts route. Assumption A4 is LOW confidence — neutral item IDs in the 2069-2095 range (tier tokens) are in items.json, but actual equippable neutral items (like `faded_broach` id=375) ARE in items.json with normal IDs.

**Note on A4:** After deeper investigation, equippable neutral items DO appear in items.json with their own IDs (e.g. `faded_broach` id=375, `vindicators_axe` id=2096). The items.json covers them. The risk is only for items added in patches after the snapshot date.

---

## Open Questions

1. **Neutral item slot field name in Valve live API**
   - What we know: CONTEXT.md calls it `item_neutral`; ROADMAP.md says VERIFY
   - What's unclear: whether Valve uses `item_neutral`, `item5` (separate from main slots), or no field at all
   - Recommendation: Plan Wave 0 includes a verification task — inspect a real scoreboard payload during a live match before committing to field name in PlayerSchema

2. **Backpack slot presence in live API**
   - What we know: Field names `item6`/`item7`/`item8` are the expected Valve convention
   - What's unclear: Whether pro match live API consistently includes these fields
   - Recommendation: Same Wave 0 verification task — treat as bonus feature; if absent, D-04 says render only main 6 slots

3. **items.json neutral item ID coverage**
   - What we know: `faded_broach` (id=375) IS in items.json; tier token markers (2091-2095) are also present
   - What's unclear: Whether all current-patch tier 1-5 neutral items are mapped
   - Recommendation: After downloading items.json, spot-check 5 known neutral items against their IDs

---

## Environment Availability

Step 2.6: Environment audit — this phase is client-side React + static file. No external runtimes required beyond what is already used.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| OpenDota API `/constants/items` | One-time items.json acquisition | ✓ | Verified 2026-04-28 | Use dotaconstants npm package |
| Valve Steam CDN | Item icon display | ✓ | HTTP 200 verified | `<img onError>` → placeholder |
| Node.js | curl + commit items.json | ✓ | 24 LTS | — |

No blocking missing dependencies.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `server/vite.config.ts` (server tests) / `client/vite.config.ts` (client tests) |
| Quick run command | `cd server && npx vitest run` / `cd client && npx vitest run` |
| Full suite command | `cd server && npx vitest run && cd ../client && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-01 | sort 10 players by net_worth descending | unit | `cd client && npx vitest run src/utils/itemMapper.test.ts` | ❌ Wave 0 |
| SC-02 | itemMapper returns name for known ID, null for 0/unknown | unit | `cd client && npx vitest run src/utils/itemMapper.test.ts` | ❌ Wave 0 |
| SC-03 | formatNW formats correctly (12400→"12.4k", 850→"850", undefined→"—") | unit | `cd client && npx vitest run src/utils/formatNW.test.ts` | ❌ Wave 0 |
| SC-04 | ItemSlot renders placeholder for id=0, unknown id, undefined | unit (component) | manual visual check | ❌ Wave 0 |

### Wave 0 Gaps

- [ ] `client/src/utils/itemMapper.test.ts` — covers SC-01, SC-02
- [ ] `client/src/utils/formatNW.test.ts` — covers SC-03
- [ ] `shared/items.json` — must exist before tests run

---

## Security Domain

This phase introduces no authentication, no new API routes, no user input, no data persistence, and no secrets. The only new external interaction is:

1. **One-time items.json download** (development-time, not runtime) — from OpenDota public API
2. **CDN image loading** — `<img>` tags to Valve Steam CDN (public CDN, same as hero portraits already used)

ASVS categories: Not applicable. No user-facing input validation, no session management, no cryptography.

The `<img onError>` handler pattern is the only "security-adjacent" consideration — it prevents broken image states from leaking any information, consistent with success criteria #4.

---

## Sources

### Primary (HIGH confidence — verified via tool calls)

- `server/src/schemas/valve.ts` — PlayerSchema, TeamScoreboardSchema, ScoreboardSchema (`.passthrough()` confirmed)
- `server/src/routes/live.ts` — live.ts route structure, item field merge behavior (items NOT copied to top-level players)
- `client/src/hooks/useDraftDetail.ts` — scoreboard access pattern, polling cadence
- `client/src/pages/MatchPage.tsx` — exact insertion point (lines 96–111)
- `client/src/utils/heroMapper.ts` — browser import pattern to replicate
- `shared/heroMapper.ts` — Node.js createRequire pattern to replicate
- `client/src/components/HeroPlayerGrid.tsx` / `PlayerRow.tsx` / `SkeletonPlayerRow.tsx` — component patterns
- `shared/heroes.json` — JSON structure pattern for items.json
- OpenDota `/constants/items` API (live call 2026-04-28) — items.json structure, 501 items, key format, img field format
- Valve Steam CDN (HTTP GET 2026-04-28) — 200 OK for `blink.png` without query string
- `.planning/phases/07-in-game-item-intel/07-CONTEXT.md` — locked decisions
- `.planning/phases/07-in-game-item-intel/07-UI-SPEC.md` — component specs

### Secondary (MEDIUM confidence)

- ROADMAP.md §Phase 7 — API reality notes (item field names, CDN URL pattern, net_worth reliability)
- `.planning/STATE.md` — accumulated decisions from prior phases

### Tertiary (LOW confidence — training knowledge only)

- Neutral item field name `item_neutral` — assumed from Valve API convention; not confirmed against live payload
- Backpack field names `item6`/`item7`/`item8` — assumed from Valve API convention; not confirmed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all tools verified in codebase
- Architecture: HIGH — data flow verified by reading actual source files
- items.json structure: HIGH — verified via live OpenDota API call
- CDN URL: HIGH — HTTP 200 confirmed
- Neutral/backpack field names: LOW — assumed, explicitly marked VERIFY in CONTEXT.md
- Pitfalls: HIGH — all derived from reading actual code paths

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (stable — items.json is a one-time snapshot; next verification at major Dota patch)
