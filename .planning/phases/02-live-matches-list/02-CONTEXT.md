# Phase 2: Live Matches List - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the home page that displays every currently-live pro tournament match, grouped by tournament, auto-refreshing every 30 seconds. Users can click any match row to navigate to a match detail route. The match detail screen itself (stats, heroes, draft) is Phase 3 — this phase only wires up the URL.

Deliverables: home page UI at `/`, match list with tournament groupings, a BFF enrichment route for league names, and a placeholder route at `/match/:matchId`.

</domain>

<decisions>
## Implementation Decisions

### Match row layout
- **D-01:** Table row style (dense horizontal), not cards. Each row shows: Team A vs Team B | series score (e.g. "1-0 Bo3") | status tag (Live / Draft / Post-game) | game duration.
- **D-02:** Status tag derives from `game_state`: 2 → "Draft", 5 → "Live", 6 → "Post-game". Any other value → "Unknown" or omit tag.
- **D-03:** Series format derives from `series_type`: 0 → "Bo1", 1 → "Bo3", 2 → "Bo5". Series score from `radiant_series_wins`/`dire_series_wins`.
- **D-04:** Game duration displayed as MM:SS from the `duration` field (seconds elapsed). Hidden when `duration` is absent (draft/lobby state).
- **D-05:** Spectator count is NOT shown — keep the row minimal.

### Tournament grouping
- **D-06:** The Valve API only provides `league_id` per match — no `league_name`. The BFF adds a new enrichment route (or inline enrichment in the `/api/live/games` response) that fetches league names from OpenDota `/leagues/{id}`, cached 6h server-side by `league_id`.
- **D-07:** Matches are grouped by tournament using accordion sections. Each section header shows the tournament name. All sections are expanded by default on load.
- **D-08:** If a league name lookup fails or returns null, fall back to "League #<league_id>" as the display label.

### Refresh UX
- **D-09:** TanStack Query's `refetchInterval: 30000` handles auto-refresh silently — no spinner, no row flash.
- **D-10:** A small last-updated timestamp (e.g. "Updated 2:41 PM") is shown in the page header or corner. Updates after each successful fetch. Format: time only (no date).

### Navigation & routing
- **D-11:** Clicking a match row navigates to `/match/:matchId` using React Router v7 `<Link>` or `useNavigate`.
- **D-12:** The `/match/:matchId` placeholder page displays the raw JSON payload for that match (looked up from the cached `/api/live/games` response). Useful for Phase 3 development. Label it clearly as a dev placeholder.

### Claude's Discretion
- Exact visual styling of the status tag (color, badge shape) — stay consistent with the dark theme (`bg-gray-950 text-white`).
- Loading skeleton or spinner while initial data loads.
- Whether league name enrichment happens in the existing `/api/live/games` route (response shape extended) or a separate `/api/leagues/:id` BFF route.
- Error state when the Valve API is unreachable.
- Accordion open/close state management approach (local useState or URL-based).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §HOME — HOME-01, HOME-02, HOME-03 define the full acceptance criteria for this phase.
- `.planning/ROADMAP.md` §Phase 2 — Success criteria (4 items) that define when this phase is complete.

### Stack & patterns
- `CLAUDE.md` §Key Patterns — `cached()` decorator usage, TanStack Query dynamic `refetchInterval`, `.passthrough()` rule for zod schemas.
- `.planning/research/STACK.md` — Exact versions, TanStack Query v5 setup, React Router v7 setup.

### Existing BFF
- `server/src/routes/live.ts` — Existing `GET /api/live/games` route; this is the data source for the home page.
- `server/src/schemas/valve.ts` — `LiveGameSchema` and `LiveLeagueGamesSchema`; `league_id` field is present, `league_name` is absent.
- `server/src/services/valveApi.ts` — Upstream Valve API service wrapped by `cached()`.

### Prior phase context
- `.planning/phases/01-foundations/01-CONTEXT.md` — D-07/D-08: TTL decisions (30s live, 6h stats); cache pattern; path alias conventions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/src/routes/live.ts` + `server/src/services/valveApi.ts`: `GET /api/live/games` already returns all live games with `league_id`, team names, `game_state`, series wins, `duration`. No new Valve API call needed for the home page.
- `server/src/cache.ts`: `cached()` decorator — use for league name enrichment route.
- `shared/heroMapper.ts`, `shared/buildingDecoder.ts`: not needed in Phase 2 (home page doesn't show heroes or buildings).

### Established Patterns
- All BFF responses go through zod schemas with `.passthrough()`.
- `cached(key, ttl, fn)` wraps upstream calls — 30s TTL for live data, 6h for league names.
- Dark theme: `bg-gray-950 text-white` established in `client/src/App.tsx`.
- TanStack Query v5 is installed but not yet wired up in the client — Phase 2 sets up `QueryClientProvider` and first `useQuery` call.
- React Router v7 is installed but not yet configured — Phase 2 sets up `BrowserRouter` and first routes (`/` and `/match/:matchId`).

### Integration Points
- `client/src/App.tsx` is the entry point — replace the placeholder with `RouterProvider` / route tree.
- `GET /api/live/games` is the backend source; the client will poll it via TanStack Query.
- Vite proxy (`/api` → `http://localhost:3000`) is already configured from Phase 1.

</code_context>

<specifics>
## Specific Ideas

- The `game_state` → status label mapping is already documented in `server/src/schemas/valve.ts` comments: 2=draft, 5=in-game, 6=post-game.
- The raw JSON dump on the `/match/:matchId` placeholder is intentional for Phase 3 — it surfaces the actual shape of data before building the match screen.
- STATE.md has a pending todo: "Confirm TanStack Query v5 dynamic `refetchInterval` signature before implementing live polling in Phase 2." — the researcher or planner should verify the exact API shape for v5 (it changed from v4).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-live-matches-list*
*Context gathered: 2026-04-23*
