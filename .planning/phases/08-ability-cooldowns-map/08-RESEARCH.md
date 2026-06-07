# Phase 8: Ability Cooldowns & Map - Research

**Researched:** 2026-04-28
**Domain:** Live-data extension — Valve API field surfacing + SVG minimap rendering + static ultimate-ability mapping
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Page Layout (two-column).** MatchPage bottom restructured into two columns:
- Left column: HeroPlayerGrid (top) + ItemsBlock (below)
- Right column: DotaMapView (top) + CooldownsBlock (below)
- Columns must be horizontally aligned (equal heights).
- Both columns only render when `game_state === 5` and scoreboard data is present.

**D-02 — Hero Positions on Minimap.** DotaMapView extended with optional `heroPositions?: HeroPosition[]`. Each hero rendered as `<image>` inside `<clipPath>` circle (~16px diameter); Radiant stroke `#4ade80`, Dire stroke `#ef4444`, strokeWidth ~1.5. When prop undefined/empty, map renders buildings only (no behavior change from Phase 7).

**D-03 — CooldownsBlock entry shape.** Each row: hero portrait 32px + ultimate ability icon 32px + countdown number + state label. State `1` (ready) excluded; state `3` (charging) shows "charging"; state `0` (unavail/dead) shows "—" + "unavail". Sorted ascending by `ultimate_cooldown`.

**D-04 — Empty-state behavior.** CooldownsBlock returns `null` (fully unmounted) when all 10 heroes have `ultimate_state === 1`. No empty placeholder.

**D-05 — Ultimate icon mapping.** Static `shared/heroUltimates.json` (or `.ts`): `hero_id → ultimate_ability_name`. Source: OpenDota `/api/heroStats` or `dotaconstants/hero_abilities.json`. Same pattern as `shared/heroes.json` and `shared/items.json`. Unknown hero → empty icon slot, no crash.

**D-06 — Data source.** `ultimate_state`, `ultimate_cooldown`, `position_x`, `position_y` come from `scoreboard.{radiant,dire}.players[]` (same path as Phase 7 items). Extend `PlayerSchema` in `server/src/schemas/valve.ts` with these four fields as `z.number().optional()`. Reuse `useDraftDetail` — no new hook. **VERIFY field names against real payload** — see Pitfall 1 below (CONTEXT.md uses `x_pos/y_pos`, but verified API source says `position_x/position_y`).

### Claude's Discretion

- Exact coordinate normalization formula (verify range, Y-axis flip).
- `<clipPath>` + `<image>` vs alternative for portrait circles in SVG.
- CooldownsBlock header label ("Cooldowns" vs "Ultimates") — UI-SPEC locks "Cooldowns".
- BuildingsSection placement in new two-column layout — UI-SPEC says full-width row below.
- Empty CooldownsBlock placeholder vs unmounted (D-04 already locks: unmounted).
- Pixel sizing to equalize left/right column heights — UI-SPEC says right column fixed 320px wide; CooldownsBlock has `flex-1`.

### Deferred Ideas (OUT OF SCOPE)

- Regular ability cooldowns — not in live API.
- Cooldown tooltip on ability icon — v2.
- Dead hero indicator styling on minimap (gray-out / skull overlay) — Claude may add if trivial.
- Zoom / click-to-navigate minimap — out of scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

The roadmap entry for Phase 8 lists requirements as TBD. The five locked success criteria below act as the de-facto requirement IDs for planning.

| ID (de-facto) | Description | Research Support |
|---|---|---|
| SC8-01 | "Cooldowns" block lists only heroes with `ultimate_state !== 1`, sorted ascending by `ultimate_cooldown` | `ultimate_state`/`ultimate_cooldown` confirmed present in scoreboard.players[] (verified payload, see Pitfall 1) |
| SC8-02 | Each cooldown entry shows hero portrait + ultimate icon + countdown in seconds | Hero portrait via existing heroMapper; ultimate icon via new `shared/heroUltimates.json` driven by `dotaconstants/hero_abilities.json` (last entry of `abilities[]` is the ultimate) |
| SC8-03 | Block hidden (unmounted) when all ultimates are ready | D-04 — early `return null` in component |
| SC8-04 | Minimap shows all 10 hero portraits at `position_x`/`position_y`, Radiant green / Dire red, updating every 30s | Coordinates verified ±8192 centered, Y-axis flipped for screen; existing useDraftDetail polls scoreboard at 5s/draft and stops after; useMatchDetail polls live-games at 30s in-game — see Section "Polling cadence" |
| SC8-05 | Hero positions only shown when `draft.scoreboard` is present (hidden during draft) | Existing `!buildings.unavailable` guard already encodes this in MatchPage; reuse the same gate |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

The following CLAUDE.md directives MUST be honored by every plan:

1. **TS + zod everywhere** — every external API response parsed through zod with `.passthrough()`. New fields in `PlayerSchema` MUST be `z.number().optional()` and the schema MUST keep `.passthrough()`.
2. **`cached()` decorator** — all upstream calls go through `cached()` keyed by data type, not per-user. No new upstream calls in this phase (Valve scoreboard already cached via `getLiveLeagueGames` + `getLiveLeagueGamesFast`).
3. **Dynamic `refetchInterval`** — 5s draft, 30s in-game, `false` post-game. Phase 8 components MUST NOT introduce a new polling cadence; reuse the existing 30s `useMatchDetail` cycle (or `useDraftDetail` 5s when extended).
4. **Stratz optional** — Phase 8 does not depend on Stratz; no change needed.
5. **Hidden profiles short-circuit at aggregator, never crash UI** — new fields are scalar numbers and crash-safe; no aggregator change required.

**Critical pitfalls reinforced from CLAUDE.md:**
- `building_state` can be absent — pattern carries to `position_x`/`position_y`/`ultimate_*`: ALWAYS check before use.
- Polling MUST stop on `game_state === 6` — reuse existing `useMatchDetail` semantics.
- `.passthrough()` on every Valve schema — Valve adds fields silently.

---

## Summary

Phase 8 is a **thin extension** of the existing Phase 7 data pipeline. Four new optional fields surface from Valve's live `scoreboard.{radiant,dire}.players[]` array via the same merge already implemented in `server/src/routes/live.ts` for item slots. No new upstream calls, no new caches, no new hooks. Two new client components (`CooldownsBlock`, extension of `DotaMapView`) consume already-merged player data through the existing 30s `useMatchDetail` polling cycle.

The two open technical questions resolved by this research:

1. **Field names — corrected.** CONTEXT.md and ROADMAP both reference `x_pos`/`y_pos`, but a real verified GetLiveLeagueGames payload uses **`position_x`** and **`position_y`** (floats, can be negative). `ultimate_state` and `ultimate_cooldown` are correct as-named.

2. **Coordinate space — corrected.** CONTEXT.md cites `~0–16384`. The actual coordinate space in Live API is **centered at (0,0) with range approximately ±8192** (verified sample shows X ∈ [-7285, +6992], Y ∈ [-6776, +6511]). The standard Dota 2 high-quality coordinate origin is map center, and screen-Y must be flipped because Valve's +Y points North while SVG Y grows downward.

**Primary recommendation:** Treat Phase 8 as a 4-plan TDD-style execution mirroring Phase 7's wave structure (test stubs → schema/static asset → utils → UI wiring). The most important pre-implementation correction is the **field-name + coordinate-range fix in CONTEXT.md/UI-SPEC**: every coordinate formula and zod field must use `position_x`/`position_y` and the centered ±8192 range, not the values written into existing context docs.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Surface new Valve scoreboard fields (`position_x/y`, `ultimate_*`) | API/Backend (BFF) | — | Single zod schema (`server/src/schemas/valve.ts`) + single merge step (`live.ts`) — both already exist for item fields, this is an additive change. No client-side parsing of Valve responses. |
| Static `hero_id → ultimate_ability_name` lookup | Static/Build (CDN-equivalent) | Browser | Same pattern as `shared/heroes.json`, `shared/items.json` — bundled JSON loaded via Vite native import. Server can also import via @shared/* alias if needed (it isn't here). |
| Coordinate normalization (Valve → SVG) | Browser | — | Pure deterministic math on already-merged data; no caching benefit; lives next to the SVG that consumes it (`DotaMapView` or a `client/src/utils/mapCoords.ts` helper). |
| Cooldown filter + sort | Browser | — | Pure derivation from already-fetched player array; runs at 30s cadence; React render-time computation is cheap (≤10 entries). |
| Polling cadence | Browser | — | Reuses existing `useMatchDetail` 30s cycle. No new query/hook. |
| Ultimate ability icon image | CDN (Valve) | — | Same `cdn.cloudflare.steamstatic.com/.../abilities/{name}.png` already used elsewhere. Browser-cached by URL. |

## Standard Stack

### Core (already installed — no new dependencies in this phase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.x [VERIFIED: package.json] | Schema for `PlayerSchema` extension | Already used everywhere; new fields require no upgrade |
| @tanstack/react-query | 5.x [VERIFIED: existing hooks] | Polling for `useMatchDetail` | Already drives the 30s match poll; phase reuses untouched |
| React 19 | [VERIFIED: existing components] | UI rendering | Already used; phase introduces no new patterns |

**No new packages required.** The phase is intentionally a pure-derivation extension.

### Static Asset Source

| Asset | Source | Purpose |
|-------|--------|---------|
| `shared/heroUltimates.json` | `dotaconstants/hero_abilities.json` [CITED: github.com/odota/dotaconstants/blob/master/build/hero_abilities.json] | Map `hero_id → ultimate_ability_name` for CDN URL |

**Generation strategy [VERIFIED]:** The `hero_abilities.json` file in odota/dotaconstants is keyed by `npc_dota_hero_<short_name>` (e.g. `npc_dota_hero_antimage`) and each entry has an `abilities: string[]` array. **The ultimate is the LAST non-`generic_hidden` entry** — confirmed by the antimage sample showing `"antimage_mana_void"` as the last element of `["antimage_mana_break", "antimage_blink", "antimage_counterspell", "generic_hidden", "antimage_persectur", "antimage_mana_void"]`. Some heroes (e.g. Invoker, Rubick) have non-standard layouts — for v1, taking the last entry is safe; flag the few exceptions as "not crashing — falls back to empty ability slot."

A small build-time Node.js script (or one-off committed JSON) reads `hero_abilities.json` + `heroes.json` (already in this repo's shared/ folder, mapping hero_id → npc name via the `name` field in odota's heroes.json), filters out `generic_hidden`, takes the last entry, and writes `shared/heroUltimates.json` of shape `{ "1": "antimage_mana_void", "2": "axe_culling_blade", ... }`. Same approach as Phase 7's items.json bootstrap.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Static `heroUltimates.json` | Live OpenDota fetch on first render | Adds a network call + cache key + race; static is simpler and patches rarely. |
| `<image>` + `<clipPath>` for hero circles on SVG | HTML overlay positioned absolutely above SVG | SVG keeps a single coordinate system + DOM tree; HTML overlay needs duplicated transform math. |
| `position_x` / `position_y` floats normalized client-side | Server-side normalization | Client-side keeps BFF changes minimal (pure pass-through); puts the SVG-specific math next to the SVG. |

## Architecture Patterns

### Data Flow Diagram

```
Valve GetLiveLeagueGames (existing call, cached 30s by getLiveLeagueGames())
        │
        │  scoreboard.{radiant,dire}.players[]
        │  ├── position_x   (NEW — float, ~±8192)
        │  ├── position_y   (NEW — float, ~±8192)
        │  ├── ultimate_state    (NEW — int 0|1|2|3)
        │  └── ultimate_cooldown (NEW — int seconds)
        ▼
server/src/schemas/valve.ts → PlayerSchema  (extend with 4 .optional() fields, keep .passthrough())
        ▼
server/src/routes/live.ts  GET /api/live/games
        │
        │  Existing scoreboard→players merge (same statsByAccountId loop)
        │  picks up the 4 new fields automatically once schema permits
        ▼
client/src/hooks/useMatchDetail.ts  (NO CHANGE — already returns radiantPlayers/direPlayers from /api/live/games at 30s cadence)
        │
        ├──> CooldownsBlock (NEW)
        │       merge radiant + dire → filter ultimate_state !== 1 → sort by ultimate_cooldown asc
        │       per row: heroMapper(hero_id).portrait + ultimateIconUrl(hero_id) + countdown
        │
        └──> DotaMapView (EXTENDED)
                accept optional heroPositions: HeroPosition[]
                normalize position_x/position_y → SVG 320×320
                render <clipPath><circle/></clipPath> + <image/> + <circle stroke=teamColor/>
                stack ABOVE building dots in SVG z-order

shared/heroUltimates.json (NEW static)
        │
        └──> client/src/utils/heroUltimateMapper.ts (NEW pure helper, mirrors heroMapper)
```

### Recommended File Layout

```
shared/
  heroUltimates.json                 # NEW — { "<hero_id>": "<ult_ability_name>" }

server/src/schemas/
  valve.ts                           # EXTEND PlayerSchema with 4 optional fields

server/src/routes/
  live.ts                            # EXTEND scoreboard merge to forward 4 new fields
                                     # (additive — same pattern as item0..item8 already does)

client/src/utils/
  heroUltimateMapper.ts              # NEW — id → ability name (mirrors heroMapper)
  heroUltimateMapper.test.ts         # NEW — coverage of known IDs + null on unknown
  mapCoords.ts                       # NEW — pure normalize(valveX, valveY) → {svgX, svgY}
  mapCoords.test.ts                  # NEW — boundary, center, both signs, range guard

client/src/components/
  CooldownsBlock.tsx                 # NEW
  DotaMapView.tsx                    # EXTEND with heroPositions prop

client/src/pages/
  MatchPage.tsx                      # RESTRUCTURE bottom into two-column layout (D-01)
```

### Pattern 1: Extending PlayerSchema additively
**What:** Add four `z.number().optional()` fields next to the Phase 7 item fields. Keep `.passthrough()`.
**Why:** Mirrors the established pattern. New Valve fields appear silently; `.passthrough()` keeps them flowing even when zod doesn't type them — but explicit typing is needed for client `PlayerItem`-style consumer interfaces to see the fields.
**Source:** [VERIFIED: server/src/schemas/valve.ts lines 26–37 — Phase 7 added item0..item_neutral the same way]

```ts
// Add inside PlayerSchema before .passthrough():
position_x: z.number().optional(),
position_y: z.number().optional(),
ultimate_state: z.number().int().optional(),    // 0=unavail/dead, 1=ready, 2=cooldown, 3=charging
ultimate_cooldown: z.number().optional(),       // seconds remaining
```

### Pattern 2: Scoreboard → top-level player merge
**What:** Inside `liveRoutes.get('/games')`, the existing loop `players.map((p) => { ... })` already spreads scoreboard stats into top-level players keyed by `account_id`. Add four new lines forwarding the new fields.
**Source:** [VERIFIED: server/src/routes/live.ts lines 72–98]

```ts
position_x: stats.position_x ?? p.position_x,
position_y: stats.position_y ?? p.position_y,
ultimate_state: stats.ultimate_state ?? p.ultimate_state,
ultimate_cooldown: stats.ultimate_cooldown ?? p.ultimate_cooldown,
```

### Pattern 3: Coordinate normalization (verified math)
**What:** Convert Valve world-space `position_x`/`position_y` to SVG 320×320 pixel space.
**Source:** [VERIFIED: real GetLiveLeagueGames sample, value ranges X∈[-7285,+6992], Y∈[-6776,+6511]] [CITED: developer.valvesoftware.com/wiki/Dota_2_Workshop_Tools — base map 17664×16643 in centered coordinate system]

Use **±8192** as the conservative half-range (powers of two; matches the practical sample bounds plus margin):

```ts
const HALF = 8192
const SVG = 320

export function normalizeMapCoords(valveX: number, valveY: number): { svgX: number; svgY: number } {
  // Clamp into the half-range to defend against Valve quirks (e.g. fountain corner offsets)
  const x = Math.max(-HALF, Math.min(HALF, valveX))
  const y = Math.max(-HALF, Math.min(HALF, valveY))

  // Map [-HALF, +HALF] → [0, SVG], with Y-axis flipped (Valve +Y = North, SVG +Y = down)
  const svgX = ((x + HALF) / (2 * HALF)) * SVG
  const svgY = (1 - (y + HALF) / (2 * HALF)) * SVG

  return { svgX, svgY }
}
```

Sanity check: Radiant fountain (~ -7000, -7000) → svgX ≈ 23, svgY ≈ 297 (lower-left of map). Dire fountain (~ +7000, +7000) → svgX ≈ 297, svgY ≈ 23 (upper-right). Matches the existing `DotaMapView` building positions: Radiant Ancient is at `(52, 258)`, Dire Ancient at `(268, 62)` — agreement is excellent.

### Pattern 4: Hero circle on SVG (D-02 locked shape)
**What:** Three layered SVG elements per hero, inside the existing `<svg>`:

```tsx
<defs>
  <clipPath id={`cp-${heroId}-${team}`}>
    <circle cx={svgX} cy={svgY} r={8} />
  </clipPath>
</defs>
<image
  href={portraitUrl}
  x={svgX - 8} y={svgY - 8}
  width={16} height={16}
  clipPath={`url(#cp-${heroId}-${team})`}
  preserveAspectRatio="xMidYMid slice"
/>
<circle
  cx={svgX} cy={svgY} r={8}
  fill="none"
  stroke={team === 'radiant' ? '#4ade80' : '#ef4444'}
  strokeWidth={1.5}
/>
```

**Important:** the `<defs>` block must be deduped — append all clipPaths once, then all images, then all stroke circles, in that draw order. Heroes must be appended AFTER building dots so they layer above.

### Pattern 5: Polling cadence — reuse existing
**What:** No new query. Both blocks consume `useMatchDetail` (30s polling, stops on `game_state === 6`). The DotaMapView is already mounted under `useMatchDetail` data; CooldownsBlock will be mounted in the same subtree and reads from the same merged `radiantPlayers` / `direPlayers`.
**Source:** [VERIFIED: client/src/hooks/useMatchDetail.ts lines 30–41]

### Anti-Patterns to Avoid

- **DO NOT** create a new query hook for cooldowns/positions — `useMatchDetail` already polls and merges these fields. A second hook would double upstream calls.
- **DO NOT** poll faster than 30s — Valve cooldowns tick once per second on the actual server, but the match scoreboard endpoint is cached 30s on our side; faster polling burns rate limit without giving fresher numbers.
- **DO NOT** treat `ultimate_state === 0` as "ready" — it means dead/respawning. Readiness is `=== 1` only.
- **DO NOT** trust `position_x`/`position_y` to be present during draft — fields only populate once `scoreboard.radiant.players[]` exists (in-game state).
- **DO NOT** assume the field name is `x_pos`/`y_pos` — it is `position_x`/`position_y`. ROADMAP.md and CONTEXT.md are wrong on this; the verified sample says `position_x`. Schemas, merge code, and SVG normalization MUST use `position_x`/`position_y`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hero ID → ultimate ability name | A custom incomplete map | Generate `shared/heroUltimates.json` from `dotaconstants/hero_abilities.json` | 130+ heroes; community-maintained source updates per patch |
| Map coordinate transform | A guess based on building positions | Centered ±8192 normalization (verified sample) | Building positions in DotaMapView were placed by eye; using them as a reference frame gives wrong hero positions for any non-laning area |
| Polling cadence for cooldowns | A new dedicated 1s timer | The existing 30s `useMatchDetail` cycle | 1s polling burns Valve rate limit; cooldowns are merely informational, not gameplay-actionable; spectator delay is already 2 minutes — sub-second precision is meaningless |
| Image circle clipping in React | CSS `border-radius` on `<img>` inside SVG | `<clipPath>` + `<image>` (D-02) | CSS doesn't apply to SVG `<image>`; the only portable way to clip an `<image>` to a circle in SVG is `<clipPath>` |

**Key insight:** This phase is almost entirely a "wire up data that already arrives" exercise — the upstream call already happens, the merge already loops over scoreboard players, the polling cycle already exists. The only genuinely new code is (a) `shared/heroUltimates.json` + 1 mapper util, (b) `mapCoords.ts` (≤20 lines), and (c) two component-level renders. Resist scope creep into "while we're here" cooldown enrichments.

## Common Pitfalls

### Pitfall 1: Field-name mismatch (CONTEXT.md/ROADMAP.md error)
**What goes wrong:** Schema declares `x_pos`/`y_pos`; merge looks up `stats.x_pos`; both come back undefined; minimap silently renders no heroes.
**Why it happens:** ROADMAP and CONTEXT both wrote `x_pos`/`y_pos`. The verified API source [CITED: GetLiveLeagueGames.json fixture in lpradel/steam-web-api-java] uses `position_x`/`position_y`.
**How to avoid:** Plans MUST extend `PlayerSchema` and the merge with **`position_x`** and **`position_y`** as the field names. Add a single VERIFY step in the first plan that logs raw scoreboard player keys at runtime before relying on them.
**Warning signs:** Heroes always render at `(160, 160)` (SVG center) on the map — this is the fallback when both coords are NaN/undefined.

### Pitfall 2: Coordinate range overflow
**What goes wrong:** A hero at (-7800, -7800) (deep base) using a 0–16384 normalization formula renders far outside the SVG viewbox at negative SVG coordinates.
**Why it happens:** Valve coordinates are **centered at 0**, range ≈±8192. Subtracting from 0 doesn't normalize correctly. CONTEXT.md says "0–16384" — wrong.
**How to avoid:** Use `(value + 8192) / 16384` (i.e. shift then normalize). Clamp to `[-8192, +8192]` first as defense.
**Warning signs:** Heroes appearing in the upper-left corner with negative SVG x; heroes vanishing off the right edge during late-game pushes; map looks "shifted" toward Dire side.

### Pitfall 3: Y-axis convention mismatch
**What goes wrong:** Radiant fountain (worldY ≈ -7000) renders at the top of the minimap; Dire fountain (worldY ≈ +7000) renders at the bottom — the map appears vertically flipped.
**Why it happens:** Valve world space has +Y = North. SVG/screen space has +Y = down. Direct `valveY → svgY` puts the smaller Y at top, which is the opposite of Dota's convention.
**How to avoid:** `svgY = (1 - normalizedY) * SVG`. The `1 -` flip is mandatory.
**Warning signs:** Existing buildings (placed by hand in DotaMapView.tsx) and hero positions don't agree — heroes appear "across the river" from where building dots show their team's base.

### Pitfall 4: Stale positions / coordinates during pause or post-game
**What goes wrong:** Game pauses → Valve stops updating positions → heroes appear "frozen" in last position. Or `game_state === 6` → polling stops but stale data still renders.
**Why it happens:** Valve doesn't expose a "fresh-as-of" timestamp on player positions. Spectator delay is already 2 min; on top of that, a paused match returns the same coords for minutes.
**How to avoid:** Acknowledge as a UX truth, not a bug. CooldownsBlock countdown will visibly stall (countdown stays at e.g. 47s for two cycles) — this is correct given the 30s poll. Do NOT add client-side ticking countdown; it would lie about the data we actually have.
**Warning signs:** None — this is expected behavior. Document it in the Plan summary so QA doesn't flag it as a defect.

### Pitfall 5: Ultimate icon URL 404 on edge-case heroes
**What goes wrong:** `Pangolier`'s ultimate `pangolier_gyroshell` resolves cleanly. Reworked heroes (Techies post-rework) or shapeshifters (Morphling, Lone Druid) have multiple ultimates or aspect-conditional ultimates.
**Why it happens:** `dotaconstants/hero_abilities.json` lists abilities in skill order; for shapeshifters the "ultimate" entry may be split across two abilities. `generic_hidden` placeholders sit between active slots in some heroes.
**How to avoid:** Filter `generic_hidden` out before taking last; use ItemSlot's existing `onError` fallback pattern (placeholder square) — same as Phase 7. If a hero is genuinely missing, render the row with empty ability slot, not crashed.
**Warning signs:** A specific hero always shows the empty placeholder in the cooldowns block while others show icons fine.

### Pitfall 6: SVG `<defs>` ID collisions
**What goes wrong:** Two heroes share an ID — clipPath rendering becomes inconsistent across browsers.
**Why it happens:** `clipPath` ID generated only from `hero_id` collides if the same hero is on both teams in mirror-pick scrims.
**How to avoid:** Suffix clipPath IDs with team: `cp-${hero_id}-${team}` (already in Pattern 4 above). Never trust hero_id alone.
**Warning signs:** Mirror picks render as one team-colored circle and one black-bordered circle.

### Pitfall 7: `ultimate_cooldown` of 0 with `ultimate_state === 1`
**What goes wrong:** Filter `ultimate_state !== 1` correctly excludes ready ults, but renders `ultimate_state === 2 && ultimate_cooldown === 0` if Valve sends a stale "still on cooldown but timer hit zero" combination.
**Why it happens:** State and timer are independent fields updated at slightly different cadences server-side.
**How to avoid:** Filter on state alone; do NOT filter on cooldown. Render `0s` correctly for the brief in-between cycle.
**Warning signs:** None — correct handling produces the expected "0s" briefly, then the row disappears next poll.

## Code Examples

### Static asset generation (one-off, run once and commit)
```ts
// scripts/buildHeroUltimates.ts (run once, output committed to shared/heroUltimates.json)
// Source: https://github.com/odota/dotaconstants
import heroes from '../shared/heroes.json' assert { type: 'json' }                    // existing
import heroAbilities from '../node_modules/dotaconstants/build/hero_abilities.json'   // npm install dotaconstants

// shared/heroes.json maps hero_id -> { name, portrait }; portrait URL contains short_name (e.g. "antimage")
// hero_abilities.json maps "npc_dota_hero_<short>" -> { abilities: string[] }
const ultimates: Record<string, string> = {}
for (const [idStr, h] of Object.entries(heroes as Record<string, { portrait: string }>)) {
  const m = h.portrait.match(/heroes\/(.+)\.png/)
  if (!m) continue
  const shortName = m[1]
  const entry = (heroAbilities as Record<string, { abilities: string[] }>)[`npc_dota_hero_${shortName}`]
  if (!entry) continue
  const ult = [...entry.abilities].reverse().find(a => a !== 'generic_hidden')
  if (ult) ultimates[idStr] = ult
}
require('fs').writeFileSync('shared/heroUltimates.json', JSON.stringify(ultimates, null, 2))
```

### `client/src/utils/heroUltimateMapper.ts`
```ts
import ults from '../../../shared/heroUltimates.json'

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

### `CooldownsBlock.tsx` skeleton (matches ItemsBlock conventions)
```tsx
import { useState } from 'react'
import { heroMapper } from '../utils/heroMapper'
import { heroUltimateIconUrl } from '../utils/heroUltimateMapper'

interface CooldownPlayer {
  hero_id?: number
  account_id?: number
  team: 'radiant' | 'dire'
  ultimate_state?: number
  ultimate_cooldown?: number
}

interface Props { players: CooldownPlayer[] }

export default function CooldownsBlock({ players }: Props) {
  const active = players
    .filter(p => p.ultimate_state != null && p.ultimate_state !== 1)
    .sort((a, b) => (a.ultimate_cooldown ?? 0) - (b.ultimate_cooldown ?? 0))

  if (active.length === 0) return null     // D-04 — fully unmounted

  return (
    <div className="flex flex-col flex-1">
      <p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-4" style={{ color: '#555555' }}>
        Cooldowns
      </p>
      <div className="flex flex-col">
        {active.map((p, i) => (
          <CooldownRow key={p.account_id ?? p.hero_id ?? i} player={p} />
        ))}
      </div>
    </div>
  )
}

function CooldownRow({ player }: { player: CooldownPlayer }) {
  const hero = player.hero_id != null ? heroMapper(player.hero_id) : null
  const ultUrl = player.hero_id != null ? heroUltimateIconUrl(player.hero_id) : null
  const stateLabel =
    player.ultimate_state === 3 ? 'charging'
      : player.ultimate_state === 0 ? 'unavail'
        : null
  const showDash = player.ultimate_state === 0
  // ... row layout per UI-SPEC §CooldownsBlock
}
```

### DotaMapView extension (heroPositions prop)
```tsx
// Inside the existing <svg> children, AFTER all <Dot> building elements:
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
          x={svgX - 8} y={svgY - 8}
          width={16} height={16}
          clipPath={`url(#cp-${h.hero_id}-${h.team})`}
          preserveAspectRatio="xMidYMid slice"
        />
      )
    })}
    {heroPositions.map(h => {
      const { svgX, svgY } = normalizeMapCoords(h.position_x, h.position_y)
      return (
        <circle key={`stroke-${h.hero_id}-${h.team}`}
          cx={svgX} cy={svgY} r={8}
          fill="none"
          stroke={h.team === 'radiant' ? '#4ade80' : '#ef4444'}
          strokeWidth={1.5}
        />
      )
    })}
  </>
) : null}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcode minimap coords by eye-fitting building positions | Use centered ±8192 + Y-flip from verified Valve coordinate spec | Phase 8 introduces formula-driven hero placement | Existing building dots remain placed by eye in DotaMapView; the new normalization formula is independent and accurate per the verified payload sample |
| Track polling separately per data type | Reuse single `useMatchDetail` 30s cycle | Phase 7 already established this | Avoids duplicate Valve calls and rate-limit pressure |

**Deprecated/outdated:**
- The `x_pos`/`y_pos` field names referenced in CONTEXT.md and ROADMAP.md — wrong; correct names are `position_x`/`position_y`.
- The `0–16384` coordinate range claim in CONTEXT.md and UI-SPEC — wrong; range is centered, ≈±8192.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The ultimate is always the last non-`generic_hidden` entry of `dotaconstants/hero_abilities.json[hero].abilities[]` | Standard Stack — Static Asset Source | Some shapeshifters / reworked heroes (Morphling, Lone Druid, Invoker, Rubick) may surface a non-ultimate name; falls back to empty ability slot — no crash. Acceptable risk for v1; can be patched per-hero in `heroUltimates.json` after first live test. |
| A2 | Valve coordinate range is ±8192 (HALF=8192) for normalization purposes | Pattern 3 — Coordinate normalization | Verified sample has X∈[-7285,+6992], Y∈[-6776,+6511] — well inside ±8192. Even if a corner of the map exceeds, the clamp guard keeps heroes inside the SVG. Low risk. |
| A3 | `position_x`/`position_y` are present whenever `scoreboard.radiant.players[]` is present | Anti-Patterns | Could be absent during the very first scoreboard tick (game_state transition 2→5). Component MUST handle `undefined` and just skip that hero, not crash. Already handled by `heroPositions` filter being `.filter(p => p.position_x != null && p.position_y != null)`. |
| A4 | `ultimate_state === 0` always means dead/unavailable, not "no data yet" | Pitfall 7 + UI-SPEC | Verified sample shows state values 1, 2, 3 in active games and 0 only on dead heroes. If 0 also means "uninitialized" pre-spawn (e.g. couriers, illusions filtered by `team === 0|1`), the row would briefly show "unavail" — graceful and acceptable. |
| A5 | Spectator delay (2-5 min) does NOT need explicit handling beyond what already exists | Pitfall 4 | Valve's stream_delay_s field already documented in the schema; existing MatchPage shows the disclosure. New blocks inherit the same delay implicitly — nothing new to do. |

**Risk summary:** All five assumptions are flagged as **VERIFY at first live-game test** in the human checkpoint of the final plan, not as blockers for planning. None require user confirmation before execution.

## Open Questions

1. **Should dead heroes appear on the minimap?**
   - What we know: D-02 says all 10 heroes always render when scoreboard present. UI-SPEC says no special dead-hero styling (CONTEXT.md `<deferred>` calls grey-out a "trivial enhancement").
   - What's unclear: Does Valve send sane `position_x/y` for dead heroes (last death location?) or zero/null?
   - Recommendation: Render dead heroes at whatever coordinates Valve provides; do not gray out in v1. Re-evaluate after first live test using `respawn_timer > 0` as the flag.

2. **Are the 4 new fields ever present on the top-level `players[]` array directly (vs only via scoreboard merge)?**
   - What we know: The Phase 7 merge is the canonical path — top-level `players[]` carries only `account_id, hero_id, name, team`. Combat stats live in `scoreboard`.
   - What's unclear: Whether Valve has ever (in any patch) put position fields on top-level players.
   - Recommendation: Trust the existing merge layer; do not add a parallel "read from top-level players" branch.

3. **Should `shared/heroUltimates.json` be auto-regenerated on each patch?**
   - What we know: `dotaconstants` is a community npm package updated per patch.
   - What's unclear: Frequency of ultimate-name changes (probably very rare; patches add new heroes more often than rename ultimates).
   - Recommendation: Manual regeneration when a new hero is added — same cadence as `shared/heroes.json` updates. Not worth a CI step in v1.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 24 | Build script for `heroUltimates.json` | ✓ [VERIFIED: project tech stack in CLAUDE.md] | 24 LTS | — |
| `dotaconstants` npm package | One-off generation of `heroUltimates.json` | ✗ (not currently installed) | needed: latest 7.x | Hand-write the JSON for the ~125 heroes (tedious, error-prone) |
| Valve CDN `cdn.cloudflare.steamstatic.com/.../abilities/{name}.png` | Ultimate ability icons | ✓ [CITED: pattern verified in items pipeline (Phase 7)] | — | `onError` placeholder square (already established pattern) |
| Existing `shared/heroes.json` | Ult-mapper short-name resolution | ✓ [VERIFIED: shared/heroes.json exists] | current | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** `dotaconstants` — install as devDependency for the build script, or download the single `hero_abilities.json` file directly via a `curl` step in the plan. Recommend `npm install --save-dev dotaconstants` for first-class TypeScript build-time imports.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest [VERIFIED: existing test files like itemMapper.test.ts in client/src/utils/] |
| Config file | client/vite.config.ts (test config) + server/vitest.config (if separate) |
| Quick run command | `npm run test --workspace client` (or equivalent — confirm in repo root package.json) |
| Full suite command | `npm test` |
| Phase gate | All client + server tests green before `/gsd-verify-work` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| SC8-01 | Filter `ultimate_state !== 1`, sort ascending by `ultimate_cooldown` | unit (pure helper) | `vitest run client/src/utils/cooldownSort.test.ts` (or inline in CooldownsBlock test) | ❌ Wave 0 |
| SC8-02 | `heroUltimateMapper(hero_id)` returns correct ult name; `null` on unknown | unit | `vitest run client/src/utils/heroUltimateMapper.test.ts` | ❌ Wave 0 |
| SC8-03 | Component returns null when filtered list is empty | unit (RTL) | `vitest run client/src/components/CooldownsBlock.test.tsx` | ❌ Wave 0 |
| SC8-04 | `normalizeMapCoords` produces sane SVG values; team colors applied; circle count = 10 | unit + RTL | `vitest run client/src/utils/mapCoords.test.ts` + `DotaMapView.test.tsx` | ❌ Wave 0 |
| SC8-05 | Hero positions hidden when buildings.unavailable / scoreboard absent | RTL | `vitest run client/src/components/DotaMapView.test.tsx` | ❌ Wave 0 |
| (schema) | `PlayerSchema` accepts new fields and rejects invalid types | unit | `vitest run server/src/schemas/valve.test.ts` (extend existing if present) | ❌ Wave 0 |
| (manual) | Live game shows correct positions and cooldowns end-to-end | smoke (human checkpoint) | open match in browser, observe minimap + cooldown count, compare to stream | n/a |

### Sampling Rate

- **Per task commit:** `vitest run` for the modified file (≤2s).
- **Per wave merge:** Full Vitest suite (all client + server tests).
- **Phase gate:** Full suite green + human checkpoint of the running app against a real live match.

### Wave 0 Gaps

- [ ] `client/src/utils/heroUltimateMapper.test.ts` — covers SC8-02
- [ ] `client/src/utils/mapCoords.test.ts` — covers SC8-04 normalization
- [ ] `client/src/components/CooldownsBlock.test.tsx` — covers SC8-01, SC8-03
- [ ] `client/src/components/DotaMapView.test.tsx` — covers SC8-04 render + SC8-05 hidden state
- [ ] `server/src/schemas/valve.test.ts` — extend with new field acceptance (or create if absent)
- [ ] `shared/heroUltimates.json` — generated/hand-curated static asset (technically not a test, but a Wave 0 artifact)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a — phase adds no auth surface |
| V3 Session Management | no | n/a |
| V4 Access Control | no | n/a — same `match_id` → public scoreboard pattern as Phase 7 |
| V5 Input Validation | yes | zod `PlayerSchema` extension with `.optional()` + `z.number().int()`; existing `Number.isFinite(matchId)` guard already on `/api/live/draft/:matchId`, no new route |
| V6 Cryptography | no | n/a |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious upstream payload (Valve sending `position_x: "<script>"` or NaN) | Tampering | zod `z.number().optional()` rejects non-numbers at the schema boundary; `.passthrough()` does not bypass typed-field validation |
| Quota exhaustion via per-user polling | DoS | No new route; Phase 8 reuses existing 30s `useMatchDetail` cycle that goes through `cached('live_games', 30)` — N viewers = 1 upstream call |
| XSS via ability icon URL | Tampering | Ability name from static `heroUltimates.json` (committed in repo); URL is constructed from a fixed CDN base + a name validated against the static map; no user-controlled input ever reaches the URL |
| SVG injection (clipPath ID) | Tampering | clipPath IDs use only numeric `hero_id` + literal `'radiant'`/`'dire'` — both fully controlled values; never user input |

No new attack surface is introduced. Phase 8 piggybacks on the Phase 7 boundary entirely.

## Sources

### Primary (HIGH confidence)
- [VERIFIED: server/src/schemas/valve.ts] — current `PlayerSchema` shape (lines 6–37), `.passthrough()` discipline
- [VERIFIED: server/src/routes/live.ts] — current scoreboard merge (lines 60–98), 30s cache via `getLiveLeagueGames`, `getLiveLeagueGamesFast`
- [VERIFIED: client/src/components/DotaMapView.tsx] — full file, 320×320 SVG, building Dot positions
- [VERIFIED: client/src/components/ItemsBlock.tsx] — row layout pattern, ItemSlot onError, neutral/backpack variants
- [VERIFIED: client/src/hooks/useMatchDetail.ts] — 30s cadence, post-game stop, scoreboard-merge consumer
- [VERIFIED: client/src/pages/MatchPage.tsx] — current bottom-section layout (`flex gap-12 items-stretch`, separate map row guarded by `!buildings.unavailable`)
- [VERIFIED: client/src/utils/heroMapper.ts, itemMapper.ts] — Vite native JSON import pattern
- [VERIFIED: shared/heroes.json] — schema `{ "<id>": { name, portrait } }`, CDN URL convention
- [VERIFIED: real GetLiveLeagueGames JSON fixture] — confirms `position_x`, `position_y`, `ultimate_state`, `ultimate_cooldown` field names; X∈[-7285,+6992], Y∈[-6776,+6511]
- [CITED: github.com/odota/dotaconstants/blob/master/build/hero_abilities.json] — schema `npc_dota_hero_<short> → { abilities: string[], talents: ... }`; ultimate is last non-`generic_hidden` element

### Secondary (MEDIUM confidence)
- [CITED: developer.valvesoftware.com/wiki/Dota_2_Workshop_Tools/Level_Design/Dota/Minimap] — base map dimensions 17664×16643 in centered coordinate system with (0,0) at map center
- [CITED: docs.bayesesports.com/docs-live-data/message-schema/misc/map_coord] — map_coord conversion semantics
- [CITED: dota2.fandom.com/wiki/Minimap] — minimap conventions (Radiant bottom-left, Dire top-right)

### Tertiary (LOW confidence)
- None — all assertions in this document are either VERIFIED against repo files or CITED against authoritative external sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all existing infra verified by file read.
- Architecture (data flow): HIGH — additive extension of two existing files; no design ambiguity.
- Coordinate transform: HIGH — verified against real payload + canonical Valve coordinate spec.
- Field names (`position_x`/`position_y`): HIGH — directly read from a real GetLiveLeagueGames JSON sample.
- Ultimate icon mapping: MEDIUM — algorithm "last non-generic_hidden" verified for Anti-Mage; flagged as A1 in Assumptions Log for shapeshifters/reworks.
- Pitfalls: HIGH — all 7 derived from established codebase patterns (Phase 7 conventions) plus the verified field-name correction.

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (30 days — Valve API + dotaconstants are stable; only a major Dota 2 patch reset would invalidate)
