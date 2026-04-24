# Phase 5: Hero & Player Intel - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Layer contextual stats onto the existing DraftTimeline and HeroPlayerGrid surfaces:
- **DRAFT-03:** current patch winrate + pro pickrate shown as a badge overlay on every drafted hero portrait in the DraftTimeline
- **DRAFT-04:** hover on any drafted pick opens a card tooltip with top-3 counterpicks (with hero portraits) and a ⚠ flag on any counter that an opposing player is "known to play"
- **PLAYER-01:** same hover tooltip as DRAFT-04 also shows the player's track record on that hero (games + winrate)
- **PLAYER-02:** hidden-profile players (account_id = 4294967295) silently skip all OpenDota lookups — no crash, no error state

New BFF routes required:
1. `GET /api/heroes/stats` — global patch hero stats (winrate + pickrate), cached 6h
2. `GET /api/live/intel/:matchId` — per-match intel: player hero histories + counterpick checks, batched and cached 15min per match_id

No changes to `PlayerRow` columns — stats are in the tooltip only.

</domain>

<decisions>
## Implementation Decisions

### Patch Hero Stats Display (DRAFT-03)
- **D-01:** Stats appear as a **badge overlay** at the bottom edge of each DraftPortrait. Format: `52% · 18%` (winrate · pickrate). Fits within the existing slot size — no timeline layout changes.
- **D-02:** Badge visible for **pick slots only** (not bans). Bans already show a red X overlay; winrate on a banned hero is low-value noise.
- **D-03:** Badge hidden for empty/placeholder slots (no hero_id). Renders only when `heroId` is defined and hero stats are loaded.

### Counterpick Tooltip (DRAFT-04)
- **D-04:** Hover a drafted pick portrait → custom **positioned card** (not browser `title`). Contains: player name + hero stats (top), then counterpicks section (bottom).
- **D-05:** Show **top-3 counterpicks** ranked by disadvantage score from OpenDota `/heroes/{heroId}/matchups`. Each entry: hero portrait (mini, ~32px) + hero name.
- **D-06:** "Known to play" flag: any counter where an opposing player meets the threshold (D-09) renders a **⚠** indicator next to the hero name. The opposing player's name is shown beside the flag (e.g. `⚠ Miracle-`).
- **D-07:** Tooltip positioned relative to the portrait — above if near the bottom of the viewport, below otherwise. Closes on mouse-leave.

### Player Stats in Tooltip (PLAYER-01)
- **D-08:** Tooltip **top section** shows: player name, then `{N} games · {W}% winrate on {HeroName}`. This data comes from OpenDota `/players/{accountId}/heroes` filtered by hero_id.
- **D-08b:** Hidden profiles (account_id = 4294967295): tooltip shows the Valve-provided player name with `—` for games and winrate. No OpenDota call made. No error state.

### "Known to Play" Threshold
- **D-09:** A player is "known to play" a hero if: `games >= 10 AND win/games > 0.5`.
  - More conservative than the STATE.md default suggestion (≥5 games) — reduces false positives for pro players who may have played a hero casually long ago.
  - Applied server-side in the intel route (not client-side), so the client receives a pre-computed `known_to_play: boolean` flag.

### BFF Architecture
- **D-10:** New route `GET /api/heroes/stats` — calls OpenDota `/api/heroStats`, cached `TTL.HERO_STATS` (6h). Returns a map `{ [heroId]: { win_rate: number, pick_rate: number } }`. One call shared across all users.
- **D-11:** New route `GET /api/live/intel/:matchId` — reads the live match from the existing games cache, extracts picks from `picks_bans`, fetches player hero histories via `Promise.allSettled` (hidden profiles short-circuited), and returns a combined payload cached `TTL.PLAYER_STATS` (15 min) keyed by `match_id`. This satisfies success criterion 5: N viewers → 1 upstream call per player per TTL.
- **D-12:** Counterpick matchup data (`/heroes/{heroId}/matchups`) fetched per hero_id, cached `TTL.HERO_STATS` (6h). The intel route triggers these fetches for all picks in the match and merges the result.
- **D-13:** All new OpenDota calls use `cached()` with explicit keys: `hero:stats`, `hero:matchups:{heroId}`, `player:heroes:{accountId}`. Never call OpenDota directly — always through `cached()`.

### Claude's Discretion
- Exact tooltip card dimensions and positioning CSS (stay within the dark theme: `#0a0a0a` bg, `#1a1a1a` border, `#d8d8d8` text).
- Badge font size and opacity (recommend `text-[9px]` with a translucent dark background strip at portrait bottom, e.g. `rgba(0,0,0,0.72)`).
- Whether to show a loading skeleton in the tooltip while intel loads (recommend: show hero name only, then fill stats when ready).
- Exact zod schema field names for new OpenDota responses.
- Whether `getPlayerHeroes` accepts a `date` param (OpenDota supports `?date=90` for 90-day window) — use if available.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Success Criteria
- `.planning/REQUIREMENTS.md` §DRAFT — DRAFT-03 and DRAFT-04: exact acceptance criteria.
- `.planning/REQUIREMENTS.md` §PLAYER — PLAYER-01 and PLAYER-02: exact acceptance criteria.
- `.planning/ROADMAP.md` §Phase 5 — 5 success criteria including the batching/caching criterion.

### Critical Patterns
- `CLAUDE.md` §Key Patterns — `cached()` decorator is the ONLY path to upstream; Stratz optional pattern (not needed here but pattern is analogous for OpenDota failures); hidden-profile short-circuit at aggregator.
- `CLAUDE.md` §Critical Pitfalls — Stratz 500 req/hr (OpenDota has similar limits — always cache server-side by match_id, never per-user); polling must stop on `game_state === 6`.

### Existing Shared Primitives
- `shared/hiddenProfile.ts` — `hiddenProfile(accountId) → boolean`. Short-circuit at the BFF aggregator before any OpenDota call. Return null stats for that player.
- `shared/heroMapper.ts` — needed client-side for counterpick hero portrait rendering in tooltip.

### Existing BFF & Schemas
- `server/src/schemas/openDota.ts` — extend with `HeroStatsSchema`, `PlayerHeroSchema`, `HeroMatchupSchema`. All with `.passthrough()`.
- `server/src/services/openDotaApi.ts` — add `getHeroStats()`, `getPlayerHeroes(accountId)`, `getHeroMatchups(heroId)`. Follow the same `cached()` + error-return-null pattern as existing `getLeagueName()`.
- `server/src/routes/live.ts` — add two new routes here (`/heroes/stats` and `/live/intel/:matchId`). Alternatively create `server/src/routes/heroes.ts` if routes file grows large — Claude's discretion.
- `server/src/cache.ts` — `TTL.HERO_STATS` (6h) and `TTL.PLAYER_STATS` (15min) already defined. Use these.

### Existing Client Code
- `client/src/components/DraftPortrait.tsx` — primary surface for D-01 (stats badge) and D-04 (hover tooltip).
- `client/src/components/DraftTimeline.tsx` — passes data down to DraftPortrait; may need to pass hero stats props.
- `client/src/components/PlayerRow.tsx` — no column changes needed; PLAYER-01 is tooltip-only.
- `client/src/components/HeroPlayerGrid.tsx` — no changes needed.

### Prior Phase Context
- `.planning/phases/04-draft-ux/04-CONTEXT.md` — D-14 (picks_bans schema), DraftPortrait sizing (~56–64px), dark theme tokens.
- `.planning/phases/03-match-core/03-CONTEXT.md` — D-07 (hidden profile treatment), D-11 (no new BFF routes for match data), caching key pattern.
- `.planning/phases/02-live-matches-list/02-CONTEXT.md` — dark theme tokens (`#0a0a0a`, `#1a1a1a`, `#b03030`), row hover pattern.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/src/services/openDotaApi.ts`: existing pattern — `cached(key, TTL, fetch)` wrapper returning `null` on any error. All new OpenDota functions must follow this exact pattern.
- `server/src/cache.ts`: `TTL.HERO_STATS = 21_600`, `TTL.PLAYER_STATS = 900` — already defined, use directly.
- `client/src/utils/heroMapper.ts`: needed in tooltip for counterpick hero portrait `src` by hero_id.
- `shared/hiddenProfile.ts`: `hiddenProfile(account_id)` — call before any OpenDota lookup; if true, skip the call entirely.

### Established Patterns
- Dark theme: `#0a0a0a` bg, `#d8d8d8` text, `#b03030` accent, `#1a1a1a` borders, `#4ade80` Radiant, `#ef4444` Dire.
- All zod schemas: `.passthrough()` and all fields `.optional()` — OpenDota adds fields without notice.
- Error handling in services: `try/catch` → `return null` (never throw to BFF route handler).
- BFF route error handling: `try { ... } catch { return c.json({ error: 'Upstream error' }, 502) }`.
- TanStack Query v5 hooks: `useQuery({ queryKey, queryFn, refetchInterval })`.

### Integration Points
- `client/src/components/DraftPortrait.tsx` — needs `heroStats?: { winRate: number; pickRate: number }` prop and `playerIntel?: { games: number; winRate: number; counters: CounterHero[] }` prop.
- New client hook `useHeroStats()` — fetches `GET /api/heroes/stats`, cached by TanStack Query, no polling (static patch data).
- New client hook `useMatchIntel(matchId)` — fetches `GET /api/live/intel/:matchId`, refetchInterval follows match game_state (same as useDraftDetail pattern).
- `client/src/pages/MatchPage.tsx` — compose new hooks and pass props into DraftSection → DraftTimeline → DraftPortrait.

</code_context>

<specifics>
## Specific Ideas

- OpenDota `/api/heroStats` returns an array of hero objects with `id`, `pro_win`, `pro_pick`, `hero_id` fields (among many others). Server computes `win_rate = pro_win / pro_pick` per hero, returns map keyed by `hero_id`.
- OpenDota `/api/players/{accountId}/heroes` returns array with `hero_id`, `games`, `win` per hero. Filter for the specific `hero_id` of the drafted hero. Apply D-09 threshold for "known to play" on counterpick heroes.
- OpenDota `/api/heroes/{heroId}/matchups` returns array with `hero_id2` (the counter hero), `games_played`, `wins` (from perspective of hero_id's opponents). Sort by `wins / games_played DESC` to rank counters. Top-3 by disadvantage score.
- Badge overlay implementation: `position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.72); font-size: 9px; text-align: center`. Renders winrate in `#4ade80` (high) / `#ef4444` (low) / `#888888` (neutral) — threshold: >52% green, <48% red, else grey.

</specifics>

<deferred>
## Deferred Ideas

- **Hero name tooltip on portrait** — was noted in Phase 4 deferred. Could be added here as a no-cost addition inside the hover card. Claude's discretion whether to include.
- **Tournament-scoped hero winrate** — hero % on this specific tournament (REQUIREMENTS.md v2). Not in Phase 5 scope.
- **OpenDota `?date=90` param** — windowing player hero stats to last 90 days. OpenDota supports this on `/players/{id}/heroes`. Claude may use this if the endpoint confirms support; otherwise fall back to all-time stats.
- **Patch winrate sparkline (trend over time)** — v2 requirement spirit. Phase 5 shows only current snapshot.

</deferred>

---

*Phase: 05-hero-player-intel*
*Context gathered: 2026-04-25*
