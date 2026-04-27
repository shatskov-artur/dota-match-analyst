# Phase 7: In-Game Item Intel - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Display a new dedicated **Items Block** on the match screen: all 10 heroes sorted descending by
net worth, each with their equipped item icons rendered. This is a new section added to MatchPage
alongside (not replacing) the existing HeroPlayerGrid.

Scope:
- `item0`–`item5` per player from `scoreboard.{radiant,dire}.players[]`
- Neutral item slot (`item_neutral`) shown if present in API response
- Backpack slots (`item6`, `item7`, `item8`) shown if present in API response
- NW-sorted cross-team ranking (Radiant and Dire heroes interleaved by wealth)
- Polling: same 30s cycle as the rest of the match screen
- Static item ID→name mapping bundled as `shared/items.json`

Out of scope:
- Replacing or modifying HeroPlayerGrid
- Item tooltips or item detail views
- Historical item progression
- Ability cooldowns (Phase 8)

</domain>

<decisions>
## Implementation Decisions

### Section Placement (D-01)
- **D-01:** Items Block is a **new separate section below HeroPlayerGrid** on MatchPage. HeroPlayerGrid
  (K/D/A, GPM, LH/DN, NW grouped by team) stays unchanged. Both sections are visible simultaneously.
  Items Block uses cross-team NW sort — a different view of the same data.

### Item ID Mapping (D-02)
- **D-02:** Bundle `shared/items.json` — same pattern as `shared/heroes.json`. One-time download from
  OpenDota `/constants/items`, committed as static file. Client imports via Vite JSON import, server
  imports directly. No runtime fetch needed. Needs manual update at major patches (item additions/renames
  are infrequent). Icon URL: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/{name}.png`
  where `name` is the key from items.json (e.g. `"radiance"`, `"black_king_bar"`).

### Row Layout (D-03)
- **D-03:** Each hero row shows: **rank# (colored by team) · hero portrait (48px) · NW · 6 item icons**.
  - Rank number is colored `#4ade80` for Radiant heroes, `#ef4444` for Dire heroes — team identity
    without extra elements.
  - NW displayed as the primary number (formatted, e.g. `12.4k`).
  - No player name or hero name in the items row — already visible in HeroPlayerGrid above.

### Item Slots — Main + Neutral + Backpack (D-04)
- **D-04:** Show item0–item5 (6 main slots) always. Additionally:
  - Neutral item slot (`item_neutral` field or similar) — show as a **separate 7th slot** if the
    API returns it, visually distinguished (slightly dimmed or with a neutral icon border).
  - Backpack slots (`item6`, `item7`, `item8`) — show as a **3-slot backpack group** if present in
    API payload, visually separated from main slots (e.g. with a small gap or lighter opacity).
  - **VERIFY during implementation:** exact field names for neutral and backpack in live API payload.
    If absent, render only 6 main slots with no error.
- **D-05:** Empty item slot (item_id = 0 or undefined) renders as a **dark placeholder square** —
  same dimensions as an item icon, no error state.

### Data Path
- **D-06:** Item fields are in `scoreboard.{radiant,dire}.players[]` (not top-level `players[]`).
  `useDraftDetail` already fetches the scoreboard at 5s/30s cadence. Extend BFF or reuse scoreboard
  data — Claude's discretion. The simplest path: extend the existing `/api/live/draft/:matchId` BFF
  response to include item fields in its player objects (they already pass through via `.passthrough()`).
  Alternatively, add item fields to the `/api/live/games` route's player objects if scoreboard players
  are richer than top-level players — verify at runtime.

### Claude's Discretion
- Exact item slot visual sizing (recommend 32–36px per icon to fit 6+ slots without overflow).
- Whether to add `item0`–`item5` + neutral + backpack fields explicitly to `PlayerSchema` or rely on
  `.passthrough()` (recommend explicit — avoids runtime surprises).
- Whether the Items Block section header reads "Items" or "Net Worth" or similar.
- CSS for empty slot placeholder (recommend `background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 4px`).
- Neutral slot visual distinction (recommend `opacity: 0.75` or a faint gold border `#888866`).
- Whether `itemMapper.ts` in shared/ or a simple inline lookup function suffices.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Success Criteria
- `.planning/ROADMAP.md` §Phase 7 — 4 success criteria + API reality notes (item field names,
  CDN URL pattern, net_worth reliability, VERIFY items).

### Critical Patterns
- `CLAUDE.md` §Key Patterns — `cached()` is the ONLY path to upstream; `.passthrough()` on all
  zod schemas; polling stops on `game_state === 6`.
- `CLAUDE.md` §Critical Pitfalls — `building_state` can be absent — same caution applies to item
  fields; always check before accessing.

### Existing Shared Primitives (patterns to follow)
- `shared/heroes.json` — static JSON bundle pattern. `shared/items.json` must follow the same structure.
- `shared/heroMapper.ts` — pattern for `itemMapper.ts` (or inline equivalent).
- `shared/hiddenProfile.ts` — no change needed, but hidden profile players still need empty item
  slots (not errors).

### Existing Server Infrastructure
- `server/src/schemas/valve.ts` — `PlayerSchema` (add `item0`–`item5`, `item_neutral`, `item6`–`item8`
  as `z.number().optional()`). Keep `.passthrough()`.
- `server/src/routes/live.ts` — existing draft route already exposes scoreboard players. Verify
  whether item fields need to be surfaced explicitly or pass through already.
- `server/src/cache.ts` — no new TTL constants needed; reuse `TTL.MATCH = 30` or existing draft TTL.

### Existing Client Infrastructure
- `client/src/pages/MatchPage.tsx` — insert `<ItemsBlock>` after `<HeroPlayerGrid>` (before map section).
- `client/src/hooks/useDraftDetail.ts` — already fetches scoreboard with player arrays; may be
  reusable for item data without a new hook.
- `client/src/utils/heroMapper.ts` — pattern reference for `itemMapper.ts`.

### Prior Phase Context
- `.planning/phases/03-match-core/03-CONTEXT.md` — HeroPlayerGrid layout, dark theme tokens.
- `.planning/phases/06-win-probability/06-CONTEXT.md` — dark theme tokens, WinProbBar position.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `shared/heroes.json` + `shared/heroMapper.ts`: exact pattern to replicate for `shared/items.json`
  + `shared/itemMapper.ts` (or inline mapper).
- `client/src/hooks/useDraftDetail.ts`: already polls scoreboard with `radiant.players[]` and
  `dire.players[]` — item fields likely present via passthrough; check if a new hook is even needed.
- `server/src/schemas/valve.ts` `PlayerSchema`: add explicit item fields here following existing pattern.

### Established Patterns
- Dark theme: `#0a0a0a` bg, `#d8d8d8` text, `#4ade80` Radiant, `#ef4444` Dire, `#1a1a1a` borders.
- Icon images: `client/public/` or CDN URLs (heroes use CDN portrait URLs — items follow same pattern).
- `formatGoldDiff` util in `client/src/utils/` — can adapt for NW display formatting.
- All player data accessed via `scoreboard.{radiant,dire}.players[]` (NOT top-level `players[]`
  for item fields — verify this distinction at runtime).

### Integration Points
- `client/src/pages/MatchPage.tsx`: insert `<ItemsBlock players={allPlayersWithItems} />` after
  `<HeroPlayerGrid>` block (around line 97–103).
- New component: `client/src/components/ItemsBlock.tsx` — receives merged array of all 10 players
  pre-sorted by net_worth descending, with team field for rank coloring.
- New utility: `client/src/utils/itemMapper.ts` (or `shared/itemMapper.ts`) — `itemId → string name`.

</code_context>

<specifics>
## Specific Ideas

- items.json structure to match: `{ "id": { "id": number, "name": string, "img": string, ... } }` —
  same shape as OpenDota `/constants/items` response. Key = item_name string (e.g. `"radiance"`).
  Need a reverse lookup: `itemIdToName: Record<number, string>` derived at startup.
- CDN icon URL: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${name}.png`
  where `name` is the item name string without `item_` prefix (verify — some names include prefix).
- Item slot sizes: 32px recommended to fit 6 main + possible neutral + backpack in one row without
  horizontal scroll.
- Rank number width: fixed ~24px, colored by team.
- Hero portrait: 48px × 48px (same as existing DraftPortrait in Draft UX).

</specifics>

<deferred>
## Deferred Ideas

- **Item tooltips** — hover item icon shows item name and description. Deferred to v2.
- **Item build progression** — show what items a hero bought over time. Requires Phase 10 (Historical Graphs) infrastructure.
- **Item cost / power spike indicator** — highlight when a hero just completed a big item (e.g. BKB). Deferred.
- **Aghanim's Scepter/Shard highlight** — special visual for Aghs. Claude may include as cosmetic enhancement if trivial to add.

</deferred>

---

*Phase: 07-in-game-item-intel*
*Context gathered: 2026-04-27*
