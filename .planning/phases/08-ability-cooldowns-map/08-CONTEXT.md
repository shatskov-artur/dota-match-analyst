# Phase 8: Ability Cooldowns & Map - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Two new visual blocks added to MatchPage, both updating on the existing 30s polling cycle:

1. **CooldownsBlock** — lists heroes whose ultimate is NOT ready (`ultimate_state !== 1`),
   sorted ascending by `ultimate_cooldown`. Hidden entirely when all ultimates are ready.
   Each row: hero portrait (32px) + ultimate ability icon (from Valve CDN via ability_id) + seconds remaining + "charging" label when `ultimate_state === 3`.

2. **Hero positions on minimap** — DotaMapView extended to accept hero positions.
   All 10 heroes rendered as portrait circles (~16px) at their `x_pos`/`y_pos` coordinates.
   Radiant = green border (`#4ade80`), Dire = red border (`#ef4444`).
   Hidden during draft phase (when `scoreboard` is absent).

Out of scope:
- Regular ability cooldowns (not in live API — only `ultimate_state`/`ultimate_cooldown`)
- Ability descriptions or tooltips
- Cooldowns for non-ultimate abilities
- Historical cooldown tracking

</domain>

<decisions>
## Implementation Decisions

### Page Layout (D-01)
- **D-01:** MatchPage layout restructured into **two columns**:
  - **Left column:** HeroPlayerGrid (top) + ItemsBlock (below)
  - **Right column:** DotaMapView (top) + CooldownsBlock (below)
  - The two columns are horizontally aligned — left and right column heights match.
  - BuildingsSection: Claude's discretion on placement (keep in right column beside/below map, or separate row below the two-column block).
  - Both columns only render when `game_state === 5` and scoreboard data is present.

### Hero Positions on Minimap (D-02)
- **D-02:** DotaMapView extended with an optional `heroPositions?: HeroPosition[]` prop.
  Each hero rendered as a `<image>` circle inside a `<clipPath>` circle in the SVG:
  - Circle radius: ~8px (16px diameter)
  - Stroke: `#4ade80` (Radiant) or `#ef4444` (Dire), stroke-width ~1.5px
  - Portrait: Valve CDN hero portrait URL (same pattern as DraftPortrait — `hero_name` from heroMapper)
  - Coordinate normalization: Valve `x_pos`/`y_pos` (~0–16384 range) → SVG 0–320 scale.
    **VERIFY during implementation:** exact coordinate range and whether y-axis is flipped.
  - When `heroPositions` is undefined or empty, map renders buildings only (no change from Phase 7).

### CooldownsBlock Entry (D-03)
- **D-03:** Each row in CooldownsBlock shows:
  - Hero portrait (32px square, same CDN pattern as HeroPlayerGrid)
  - Ultimate ability icon (32px, from Valve CDN: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/{ability_name}.png`)
  - Seconds remaining as bold number + `"s"` suffix (e.g. `"12s"`)
  - State label `"charging"` in muted color when `ultimate_state === 3`
  - `ultimate_state === 0` (unavailable / dead) shown with `"—"` or `"unavail"` label
  - Block sorted ascending by `ultimate_cooldown` (heroes with least time left shown first)
- **D-04:** CooldownsBlock is completely hidden (not rendered) when all 10 heroes have `ultimate_state === 1`.

### Ultimate Ability Icon Mapping (D-05)
- **D-05:** Static mapping file `shared/heroUltimates.json` (or `shared/heroUltimates.ts`):
  `hero_id → ultimate_ability_name` (the string used in the CDN URL).
  Source: OpenDota `/api/heroStats` or Valve `GetHeroAbilities` data, committed as a static file.
  Same pattern as `shared/heroes.json` and `shared/items.json`.
  If a hero's ultimate name is unknown, fall back to rendering without the ability icon (empty slot, no crash).

### Data Source (D-06)
- **D-06:** `ultimate_state`, `ultimate_cooldown`, `x_pos`, `y_pos` come from
  `scoreboard.{radiant,dire}.players[]` — same data path as item fields in Phase 7.
  Extend `PlayerSchema` in `server/src/schemas/valve.ts` with these four fields as
  `z.number().optional()` (same pattern as item fields).
  Reuse `useDraftDetail` — no new hook needed.
  **VERIFY during implementation:** exact field names `ultimate_state` / `ultimate_cooldown` /
  `x_pos` / `y_pos` against a real in-game API payload.

### Claude's Discretion
- Exact coordinate normalization formula for `x_pos`/`y_pos` → SVG coordinates (verify range, y-flip).
- Whether `<clipPath>` + `<image>` or a CSS-circle approach works better for portrait circles in SVG.
- CooldownsBlock header label ("Cooldowns" or "Ultimates").
- BuildingsSection placement in the new two-column layout.
- Empty CooldownsBlock placeholder vs fully unmounted (recommend unmounted — no empty state needed since success criteria says "hidden").
- Pixel dimensions to make right column height match left column height (flex-col + justify-between or min-height).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Success Criteria
- `.planning/ROADMAP.md` §Phase 8 — 5 success criteria + API reality notes (field names,
  coordinate range, VERIFY notes).

### Critical Patterns
- `CLAUDE.md` §Key Patterns — `cached()` wraps all upstream calls; `.passthrough()` on zod schemas;
  polling stops on `game_state === 6`.
- `CLAUDE.md` §Critical Pitfalls — fields can be absent; always check before decoding.

### Existing Components to Extend or Reuse
- `client/src/components/DotaMapView.tsx` — extend with optional `heroPositions` prop.
  SVG is 320×320 with `viewBox="0 0 320 320"`. Already has `Dot` component pattern for circles.
- `client/src/components/ItemsBlock.tsx` — layout pattern for the new CooldownsBlock (similar row structure).
- `client/src/components/HeroPlayerGrid.tsx` — hero portrait CDN URL pattern.
- `client/src/components/DraftPortrait.tsx` — hero portrait URL pattern (another reference).

### Existing Server Infrastructure
- `server/src/schemas/valve.ts` — `PlayerSchema` (add `ultimate_state`, `ultimate_cooldown`,
  `x_pos`, `y_pos` as `z.number().optional()`). Keep `.passthrough()`.
- `server/src/routes/live.ts` — draft route already exposes scoreboard players with passthrough.
  No new route needed unless fields need explicit surfacing.

### Existing Client Infrastructure
- `client/src/hooks/useDraftDetail.ts` — already polls scoreboard; extend types to include new fields.
- `client/src/pages/MatchPage.tsx` — restructure the two bottom sections (items row + map row)
  into a single two-column layout.
- `client/src/utils/heroMapper.ts` — hero_id → name, used to build portrait CDN URL.
  Same pattern needed for ultimate ability icon URL.

### Prior Phase Context
- `.planning/phases/07-in-game-item-intel/07-CONTEXT.md` — ItemsBlock layout, row pattern,
  static JSON bundle approach (D-02, D-03) — CooldownsBlock follows the same approach.
- `.planning/phases/03-match-core/03-CONTEXT.md` — dark theme tokens, HeroPlayerGrid layout.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DotaMapView.tsx`: 320×320 SVG with `Dot` component — extend to accept `heroPositions[]` alongside `buildings`.
- `ItemsBlock.tsx`: row-per-hero pattern with portrait + data cells — CooldownsBlock follows same structure.
- `shared/heroes.json` + `heroMapper.ts`: pattern for `shared/heroUltimates.json` mapping.
- `useDraftDetail.ts`: already polls scoreboard players at 5s/30s — `x_pos`, `y_pos`, `ultimate_state`, `ultimate_cooldown` will be present once PlayerSchema is extended.

### Established Patterns
- Dark theme: `#0a0a0a` bg, `#d8d8d8` text, `#4ade80` Radiant, `#ef4444` Dire, `#1a1a1a` borders.
- Static JSON bundles: `shared/heroes.json`, `shared/items.json` — add `shared/heroUltimates.json`.
- Valve CDN: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/{ability_name}.png`
- Hidden during draft: `!buildings.unavailable` guard already exists for map section.

### Integration Points
- `client/src/pages/MatchPage.tsx`: merge the existing items row + map row into one two-column layout.
  Left col: HeroPlayerGrid + ItemsBlock. Right col: DotaMapView (extended) + CooldownsBlock.
- `server/src/schemas/valve.ts` `PlayerSchema`: add 4 new optional fields.
- `shared/heroUltimates.json`: new static file, committed alongside `shared/heroes.json`.

</code_context>

<specifics>
## Specific Ideas

- Right column sizing: DotaMapView is fixed 320×320. CooldownsBlock should fill remaining height
  of right column with `flex-1` so both columns have equal total height.
- Hero portrait circle on SVG: `<clipPath id="cp-{heroId}"><circle cx={x} cy={y} r={8}/></clipPath>`
  + `<image href={portraitUrl} x={x-8} y={y-8} width={16} height={16} clipPath="url(#cp-{heroId})" />`
  + `<circle cx={x} cy={y} r={8} fill="none" stroke={teamColor} strokeWidth={1.5} />`
- Cooldown sort: `heroes.filter(h => h.ultimate_state !== 1).sort((a,b) => a.ultimate_cooldown - b.ultimate_cooldown)`
- `ultimate_state === 0`: hero is dead (respawning) — show with "dead" label or just omit from list (Claude's discretion).
- `heroUltimates.json` minimal shape: `{ [hero_id: string]: string }` where value is the ability name string
  used in CDN URL (e.g. `"antimage_mana_void"`, `"axe_culling_blade"`).

</specifics>

<deferred>
## Deferred Ideas

- **Regular ability cooldowns** — `abilities[]` array only carries level, no cooldown state. Would need a different API endpoint or Stratz. Deferred.
- **Cooldown tooltip** — hover ability icon shows ability name and description. Deferred to v2.
- **Dead hero indicator on map** — show dead heroes differently (grayed out, skull overlay). Simple to add but not in success criteria — Claude may add as trivial enhancement if straightforward.
- **Zoom / click on minimap** — interactive map navigation. Out of scope.

</deferred>

---

*Phase: 08-ability-cooldowns-map*
*Context gathered: 2026-04-28*
