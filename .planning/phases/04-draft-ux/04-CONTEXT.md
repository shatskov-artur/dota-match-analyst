# Phase 4: Draft UX - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Populate the draft screen on the match page with real picks and bans during `game_state === 2`. Show all picks and bans as hero portraits in a side-by-side Radiant | Dire grid, indicate which team is currently on the clock, and upgrade polling to 5 s during draft / 30 s in-game / `false` post-game.

No new BFF route required. All data comes from `/api/live/games` (`picks_bans` array + `game_state`). Hero & Player Intel (DRAFT-03, DRAFT-04, PLAYER-01, PLAYER-02) belongs to Phase 5 — this phase only covers DRAFT-01 and DRAFT-02.

</domain>

<decisions>
## Implementation Decisions

### Draft Section Layout
- **D-01:** Side-by-side layout: Radiant column on the left, Dire column on the right. Each column has two rows — picks row (5 slots) above bans row (7 slots). Mirrors how analysts read a draft.
- **D-02:** Empty bordered placeholder slots always shown for unfilled picks and bans (5 pick boxes + 7 ban boxes per team). Shows remaining slots at a glance — draft reads as a progress tracker.
- **D-03:** Section position on MatchPage: after ScoreHeader, before HeroPlayerGrid. Section order: Title → ScoreHeader → DraftSection → HeroPlayerGrid → Buildings.

### Ban Visualization
- **D-04:** Banned heroes displayed at the same portrait size as picks. Bans are visually distinguished by a semi-transparent red X overlay on the portrait. Hero identity preserved — you can still read the hero at a glance.
- **D-05:** Empty ban slots use the same bordered placeholder style as empty pick slots, so the grid feels uniform.

### Turn Indicator
- **D-06:** Active team signalled by two cues simultaneously: (1) a text label above the draft grid reading `Radiant — picking` / `Dire — banning` (or `— picking` / `— banning` if action type can be derived), (2) a subtle left-edge ember glow on the active team's column — consistent with the existing hover pattern (`#b03030` left border, low opacity glow).
- **D-07:** Turn indicator is hidden once `game_state` leaves draft (no "active team" concept post-draft).
- **D-08:** If the Valve API does not expose an explicit "active team" field, infer the active team from the `picks_bans` order using the known Dota 2 alternating ban/pick sequence. If inference is ambiguous or `picks_bans` is unavailable, hide the turn indicator rather than guess wrong.

### Draft ↔ In-Game Transition
- **D-09:** Draft section appears **only** when `game_state === 2`. Not rendered pre-draft (lobby) or during loading.
- **D-10:** Once the game transitions to `game_state === 5` (in-game), the draft section **persists** above HeroPlayerGrid — showing the final draft for context while watching the in-game stats. Turn indicator is hidden (no active team), but picks/bans remain visible.
- **D-11:** Draft section never appears when `game_state === 6` (post-game) if it was not already visible, but if it was rendered it stays frozen (same as in-game behavior).

### Polling Upgrade (carried from Phase 3 D-12)
- **D-12:** Upgrade `useMatchDetail` (and `useLiveGames` if needed) to use the dynamic `refetchInterval` callback form: `refetchInterval: (query) => game_state === 2 ? 5_000 : game_state === 6 ? false : 30_000`. TanStack Query v5 supports `(query) => number | false` as the refetchInterval value.
- **D-13:** The 5 s interval applies only while `game_state === 2`. Once the game starts (state 5), interval reverts to 30 s. Post-game (state 6) stops polling entirely.

### Schema Extension
- **D-14:** Add `picks_bans` array to `LiveGameSchema` in `server/src/schemas/valve.ts`. Each entry needs at minimum: `hero_id` (number, optional), `is_pick` (boolean), `team` (number: 0=Radiant, 1=Dire), `order` (number). Apply `.passthrough()` on the picks_bans item schema — Valve may add fields.
- **D-15:** The `picks_bans` field itself is `.optional()` — absent pre-draft and in some lobby states.

### Claude's Discretion
- Exact portrait size for pick slots (recommend ~56–64 px square, consistent with PlayerRow portrait).
- Whether the text label and glow update optimistically on each poll or only on confirmed `picks_bans` change.
- CSS animation choice for the left-edge glow (CSS transition vs keyframe pulse — keep subtle, not distracting).
- Exact red X styling (SVG icon vs CSS `::after` pseudo-element with rotation).
- Column header labels ("Radiant" / "Dire" in their respective team colors `#4ade80` / `#ef4444`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Success Criteria
- `.planning/REQUIREMENTS.md` §DRAFT — DRAFT-01 and DRAFT-02: exact acceptance criteria for this phase.
- `.planning/ROADMAP.md` §Phase 4 — 3 success criteria (DRAFT-01, DRAFT-02, polling cadence).

### Critical Patterns
- `CLAUDE.md` §Key Patterns — dynamic `refetchInterval` (5s draft / 30s in-game / `false` post-game). This is the PRIMARY upgrade in Phase 4.
- `CLAUDE.md` §Critical Pitfalls — polling MUST stop on `game_state === 6`; `building_state` can be absent (not relevant here but do not break existing logic).

### Existing Shared Primitives
- `shared/heroMapper.ts` — `heroMapper(heroId) → { name, portrait } | null`. Use for both pick and ban portrait rendering. Returns `null` for missing `hero_id` — render empty slot.
- `shared/hiddenProfile.ts` — not needed for draft (hero_id is present for all draft actions), but do not break existing usage in PlayerRow.

### Existing BFF & Schemas
- `server/src/schemas/valve.ts` — `LiveGameSchema`: Phase 4 adds `picks_bans` array here. All other fields already typed.
- `server/src/routes/live.ts` — `GET /api/live/games` is the only endpoint. No new route.

### Existing Client Code
- `client/src/hooks/useMatchDetail.ts` — Primary hook to modify. Upgrade `refetchInterval` from plain `30_000` to dynamic callback (D-12). Current code has a `CRITICAL (TQ v5)` comment marking this as a Phase 4 upgrade.
- `client/src/pages/MatchPage.tsx` — Add `DraftSection` between `ScoreHeader` and `HeroPlayerGrid`. Conditional render: `{(match?.game_state === 2 || draftVisible) && <DraftSection ... />}`.
- `client/src/components/HeroPlayerGrid.tsx` — No changes needed; continues to show empty portrait slots during draft (Phase 3 D-13).

### Prior Phase Context
- `.planning/phases/03-match-core/03-CONTEXT.md` — D-12 (refetchInterval upgrade spec), D-13 (draft state empty slots contract), D-10 (buildings hide during draft).
- `.planning/phases/02-live-matches-list/02-CONTEXT.md` — dark theme tokens, row hover pattern.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `shared/heroMapper.ts`: `heroMapper(id)?.portrait` for both pick and ban portrait `src`. Returns `null` → render empty bordered slot (no crash).
- `client/src/components/PlayerRow.tsx`: Hero portrait pattern (48 px square, `object-cover`, grey fallback) — match this size or choose consistently.
- `client/src/utils/gameState.ts`: `getStatusLabel(gameState)` already handles draft state — reuse or extend.
- `client/src/components/ScoreHeader.tsx`: Reference for section header styling used on the match page.

### Established Patterns
- Dark theme: `#0a0a0a` bg, `#d8d8d8` text, `#b03030` accent (turn indicator glow), `#4ade80` Radiant, `#ef4444` Dire, `#1a1a1a` borders.
- Left-edge glow hover: `borderLeft: '2px solid #b03030'`, background shifts to `#111111`. Apply to active team column.
- Tailwind 4 CSS-first: utility classes + inline `style` for specific color values.
- TanStack Query v5: `refetchInterval` accepts `(query: Query) => number | false | undefined`. Use this form — plain number is valid too but callback is required for dynamic intervals.
- All zod schemas use `.passthrough()`. Never strip unknown fields.

### Integration Points
- `client/src/pages/MatchPage.tsx` lines 56–57: `<HeroPlayerGrid>` is the insertion point — `DraftSection` goes above it, inside the same `mt-12` container or as its own section.
- `server/src/schemas/valve.ts` line 35 (`LiveGameSchema`): add `picks_bans: z.array(PickBanSchema).optional()` here.
- `client/src/hooks/useMatchDetail.ts` line 35 (`refetchInterval`): upgrade from `matchFromCache?.game_state === 6 ? false : 30_000` to the three-way callback.

</code_context>

<specifics>
## Specific Ideas

- Standard Dota 2 Captain's Mode ban/pick order (for turn inference): Ban phase 1 (R-D-R-D-R-D), Pick phase 1 (D-R-R-D-D-R), Ban phase 2 (D-R-D-R), Pick phase 2 (R-D-R-D). Total: 12 bans, 10 picks. The `order` field in `picks_bans` entries gives the sequence index — active team is `picks_bans[length].team` (next slot).
- Left-edge glow implementation: wrap each team's column in a `div` with `transition: border 160ms ease, box-shadow 160ms ease`. When active: `borderLeft: '2px solid #b03030', boxShadow: '-4px 0 12px rgba(176,48,48,0.25)'`.
- Turn label placement: small `text-[10px] uppercase tracking-[0.25em]` label above the draft grid, similar to the "Radiant" / "Dire" group labels in HeroPlayerGrid. Color: `#555555` when inactive, team color when describing active team.
- `picks_bans` sorted by `order` ascending before rendering — Valve does not guarantee order.

</specifics>

<deferred>
## Deferred Ideas

- **Draft pick timer** — estimating seconds remaining on a pick. Would need a clock reference not in the API. Noted for v2.
- **Hero name tooltip on draft portrait** — hovering a pick/ban to see the hero name. Could add in Phase 5 when hover interactions are introduced for counterpick tooltips.
- **Captain's Mode phase label** (e.g. "Ban Phase 1 / Pick Phase 1") — useful context but not in DRAFT-01/DRAFT-02 scope.

</deferred>

---

*Phase: 04-draft-ux*
*Context gathered: 2026-04-24*
