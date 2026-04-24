# Phase 3: Match Core - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the `MatchPlaceholder` page (`/match/:matchId`) with a real in-game match screen. Users see: team kill scores and net-worth gold diff, a 5v5 hero grid with alive/dead state and respawn countdowns, tower/barracks status per lane, series score and delay disclosure, and per-player K/D/A + net worth + level + GPM/XPM + last hits/denies.

No new BFF routes are required. All data is already in `/api/live/games`. Draft UI belongs to Phase 4 — Phase 3 renders empty hero slots during draft state.

</domain>

<decisions>
## Implementation Decisions

### Layout (Match Screen Structure)
- **D-01:** Top-to-bottom section order: Back nav + match title → Score header → Hero/player grid → Buildings section. Each section stacks vertically, matching the reading order a viewer needs during a live match.
- **D-02:** Gold difference shown as a number only (e.g. `+4,200`). No bar visualization. Keep it consistent with the app's minimal aesthetic.
- **D-03:** Delay disclosure is a subtle label near the score row (e.g. `~2min delay`). Not a banner. Visible but not alarming.
- **D-04:** Page top has Back nav (← back to matches) + an H1 match title (`Team A vs Team B`). Consistent with the MatchPlaceholder pattern already in place.

### Hero Grid + Player Stats (merged widget)
- **D-05:** MATCH-02 (hero portrait + alive/dead + respawn) and MATCH-05 (K/D/A + net worth) are merged into one row per player. Each row: hero portrait | alive/dead + respawn countdown | K/D/A | net worth. No separate hero grid above and player table below.
- **D-06:** Dead hero indication: greyed-out portrait (dark overlay / desaturation) + respawn countdown number below the portrait. No red tint — keep it monochromatic.
- **D-07:** Hidden-profile player (`account_id === 4294967295`): show the Valve-provided name + hero portrait + match KDA (those exist in Valve data regardless of profile). Do NOT fetch or show any OpenDota player-history stats. Never crash or show an error state.

### Extended Player Stats (user-selected beyond MATCH-05)
- **D-08:** In addition to K/D/A + net worth (required by MATCH-05), also show per-player: **hero level**, **GPM / XPM**, and **last hits / denies**. These fields are available on the player object via `.passthrough()` — treat them as optional (show only if present).

### Buildings
- **D-09:** Tower and barracks state rendered as a schematic lane layout: two columns (Radiant | Dire), three rows (Top / Mid / Bot), with icons or dots for T1, T2, T3, melee rax, ranged rax. Standing = lit/full opacity, destroyed = dim/muted. Use the output of `buildingDecoder()` directly.
- **D-10:** When `buildingDecoder` returns `unavailable: true` (i.e. `tower_state` is absent — typical during draft/lobby), hide the buildings section entirely. No placeholder text. This prevents the "all alive" default from being misleading.

### Data Source & Polling
- **D-11:** No new BFF route for Phase 3. The match screen reuses the `/api/live/games` data, filtered client-side by `match_id`. Implementation: call `useQueryClient().getQueryData(['live-games'])` to read from cache; if the match isn't found, trigger a fresh refetch of the games list.
- **D-12:** `refetchInterval: 30_000` (plain number) in the match hook for Phase 3. Phase 4 upgrades this to a dynamic `(query) => interval` callback to support 5s draft / 30s in-game / `false` post-game. Note: `refetchInterval` must be set to `false` (or `0`) when `game_state === 6` to stop draining upstream quota.

### Edge Cases
- **D-13:** **Draft state** (`game_state === 2`): Show score header and series score with what data exists. Hero/player grid renders 5 empty portrait slots per side — no hero portraits, no KDA, no crash. Waiting for Phase 4 to populate this section.
- **D-14:** **Post-game** (`game_state === 6`): Freeze the last known stats on screen. Polling stops silently (refetchInterval → false/0). The status tag area shows "Game over" instead of the live/draft status label.
- **D-15:** **Match not in cache** (direct URL navigation): Trigger a fresh `/api/live/games` refetch. If the match is found after the fetch, render normally. If still not found (match ended or invalid ID), redirect to the home page — no error page.

### Claude's Discretion
- Loading state on the match page (skeleton rows vs minimal spinner) — stay consistent with the dark aesthetic.
- Exact color used for Radiant gold diff vs Dire gold diff — use the established green/red spectrum within the dark palette.
- Column ordering within the player row (hero portrait, level, K/D/A, net worth, GPM, XPM, LH/DN) — prioritize K/D/A + net worth as the most-scanned columns.
- Whether GPM, XPM, last hits, denies are shown inline or as a secondary row per player.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Success Criteria
- `.planning/REQUIREMENTS.md` §MATCH — MATCH-01 through MATCH-05: exact acceptance criteria for this phase.
- `.planning/ROADMAP.md` §Phase 3 — 5 success criteria that define when Phase 3 is done.

### Critical Patterns
- `CLAUDE.md` §Key Patterns — `cached()` decorator contract, `.passthrough()` on all zod schemas, dynamic `refetchInterval` (5s draft / 30s in-game / `false` post-game), Stratz optional pattern, hidden-profile short-circuit.
- `CLAUDE.md` §Critical Pitfalls — `building_state` can be absent (always check before decoding bitmask), polling MUST stop on `game_state === 6`.

### Existing Shared Primitives (all already built — use directly)
- `shared/buildingDecoder.ts` — `buildingDecoder(towerState, barracksState) → BuildingState`. Handles `undefined` gracefully; `unavailable: true` when `towerState` is absent.
- `shared/heroMapper.ts` — `heroMapper(heroId) → { name, portrait } | null`. Portrait URL is Valve CDN. Returns `null` for unknown IDs.
- `shared/hiddenProfile.ts` — `hiddenProfile(accountId) → boolean`. Returns `true` for `account_id === 4294967295`.

### Existing BFF & Schemas
- `server/src/schemas/valve.ts` — `LiveGameSchema` and `PlayerSchema`: all fields needed for Phase 3 are already typed (radiant_score, dire_score, players[].kills/death/assists/net_worth/hero_id/respawn_timer, tower_state, barracks_state, stream_delay_s, series_type, radiant_series_wins, dire_series_wins). Additional player fields (level, gpm, xpm, lh, dn) arrive via `.passthrough()`.
- `server/src/routes/live.ts` — `GET /api/live/games` is the only BFF endpoint needed. No new route required.

### Existing Client Patterns
- `client/src/hooks/useLiveGames.ts` — TanStack Query v5 hook pattern, `refetchInterval: 30_000`, v5 breaking changes documented inline. Phase 3 creates a `useMatchDetail` hook following the same pattern.
- `client/src/pages/MatchPlaceholder.tsx` — This page is REPLACED by Phase 3. Its existing Back nav, match title heading, and ambient glow can be kept as structural reference.

### Prior Phase Context
- `.planning/phases/01-foundations/01-CONTEXT.md` — D-04 through D-08: heroMapper CDN pattern, `buildingDecoder` contract, cache TTLs (30s live, 6h league names).
- `.planning/phases/02-live-matches-list/02-CONTEXT.md` — D-01 through D-10: dark theme (`#0a0a0a` / `#d8d8d8` / `#b03030`), row style patterns, game_state label mapping, series format, silent refresh approach, last-updated timestamp.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `shared/buildingDecoder.ts`: fully built, tested, and exported. `BuildingState` interface with `{ radiant, dire, unavailable }`. Use directly — no reimplementation.
- `shared/heroMapper.ts`: `heroMapper(id)` returns `{ name, portrait }` or `null`. Portrait is a Valve CDN URL. Use for hero grid image `src`.
- `shared/hiddenProfile.ts`: `hiddenProfile(accountId)` guard. Call before any player-name or stats display.
- `client/src/components/StatusTag.tsx`: existing status tag component. "Game over" label for post-game state can reuse or extend this.
- `client/src/utils/gameState.ts`: `getStatusLabel()` already handles game_state 2/5/6. Extend for "Game over" display.
- `client/src/utils/formatDuration.ts`: MM:SS formatter already exists. Reuse for respawn countdown and game duration.
- `client/src/hooks/useLiveGames.ts`: Shows the exact TanStack Query v5 pattern to follow for `useMatchDetail`.

### Established Patterns
- Dark theme: `background: #0a0a0a`, text `#d8d8d8`, accent `#b03030`, borders `#1a1a1a`/`#141414`.
- Hover state: background shifts to `#111111`, ember accent `#b03030` appears on left edge.
- Tailwind 4 CSS-first: utility classes + inline `style` objects for specific color values not in the palette.
- TanStack Query v5: `useQuery({ queryKey, queryFn, refetchInterval })`. No `onSuccess` — use `dataUpdatedAt`.
- All zod schemas use `.passthrough()`. Never strip unknown fields.

### Integration Points
- `client/src/pages/MatchPlaceholder.tsx` is the file to REPLACE. It already imports `useParams`, `useQueryClient`, and has the Back nav + ambient glow structure.
- `shared/index.ts` exports all shared primitives — import via `@shared/heroMapper`, `@shared/buildingDecoder`, `@shared/hiddenProfile`.
- `client/src/App.tsx` route for `/match/:matchId` already points to `MatchPlaceholder` — Phase 3 swaps in the new `MatchPage` component.

</code_context>

<specifics>
## Specific Ideas

- The `MatchPlaceholder.tsx` ambient glow and Back nav HTML structure can be reused almost verbatim as the scaffold for `MatchPage`.
- `PlayerSchema` in `valve.ts` already has a comment: `// 0=Radiant, 1=Dire, 2=Broadcaster, 4=Unassigned` on the `team` field. Use this to split the 10 players into Radiant (team=0) and Dire (team=1) for the two-group display.
- `stream_delay_s` is typically 120 (2 minutes). Use this value for the delay disclosure label rather than hardcoding "~2min". If absent, fall back to "~2min delay".
- Hero portraits: `heroMapper(hero_id)?.portrait` → `<img src={portrait} />`. Returns `null` for absent `hero_id` (draft state) — render empty slot without crashing.
- `respawn_timer === 0` means alive; `> 0` means dead with that many seconds remaining. The `alive` state is `respawn_timer === 0` (not just absence of the field).

</specifics>

<deferred>
## Deferred Ideas

- **Spectator count** — was excluded in Phase 2 (D-05). No change for Phase 3. Could be added in Phase 7 (Harden) if useful.
- **GPM/XPM sparkline / trend** — showing a trend line over time rather than a single number. Noted for v2 (matches the "Win probability sparkline" v2 item in REQUIREMENTS.md spirit).
- **Roshan respawn timer** — v2 requirement in REQUIREMENTS.md. Not in Phase 3 scope.
- **Draft pick timer** — Phase 4 scope.

</deferred>

---

*Phase: 03-match-core*
*Context gathered: 2026-04-24*
