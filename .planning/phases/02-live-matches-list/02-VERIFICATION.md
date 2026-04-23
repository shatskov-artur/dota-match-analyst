---
phase: 02-live-matches-list
verified: 2026-04-24T01:42:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Navigate to http://localhost:5173 with the dev server running. Confirm the page title 'Dota 2 Match Analyst' appears in green, match rows are grouped by tournament in accordion sections, and each row shows team names, series score, status tag, and duration when available."
    expected: "Live match list renders with grouped leagues, 'Updated H:MM AM/PM' timestamp in header, and clicking a row navigates to /match/:matchId with raw JSON and DEV PLACEHOLDER label"
    why_human: "Visual rendering, accordion expand/collapse toggle, and click-navigation cannot be verified without a running browser"
  - test: "With the dev server running, wait 30 seconds after page load and observe the header timestamp."
    expected: "'Updated H:MM AM/PM' timestamp updates to a new time without any user interaction, confirming auto-refresh is live"
    why_human: "Time-based background refetch behavior can only be confirmed visually in a running browser"
  - test: "Simulate BFF being unreachable (stop the server) while the client is loaded, then trigger a refetch cycle."
    expected: "ErrorBanner appears: 'Could not load live matches — Valve API unreachable. Retrying in 30 seconds.'"
    why_human: "Error state requires a server-down scenario and live browser observation"
---

# Phase 2: Live Matches List Verification Report

**Phase Goal:** A user lands on the home page and immediately sees every pro match that is playable right now, grouped by tournament, refreshing itself without interaction.
**Verified:** 2026-04-24T01:42:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

All four ROADMAP success criteria are evaluated against the actual codebase.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User sees a list of every live pro match with team names, series score (e.g. "1-0 Bo3"), and a status tag of Live/Draft/Post-game (HOME-01) | VERIFIED | `MatchRow.tsx` renders `radiantName vs direName`, `{radiantWins}-{direWins} {seriesLabel}`, and `<StatusTag status={statusLabel}/>`. `getStatusLabel` maps 2→Draft, 5→Live, 6→Post-game exactly. `getSeriesLabel` maps 0→Bo1, 1→Bo3, 2→Bo5. 21 unit tests pass confirming all mappings. |
| 2 | User sees active tournaments as groupings so they can browse matches by league (HOME-02) | VERIFIED | `LeagueAccordion.tsx` renders per-league sections. `groupByLeague()` in `useLiveGames.ts` groups by `league_id` with insertion-order preservation via `Map<number,...>`. BFF `live.ts` enriches every game with `league_name` from OpenDota, cached 6h, with `"League #${id}"` fallback. 5 unit tests for `groupByLeague` all pass. `LeagueAccordion` is `useState(true)` — expanded by default per spec. |
| 3 | Home page re-fetches and visually updates every 30 seconds with no user action (HOME-03) | VERIFIED (code), HUMAN NEEDED (behavior) | `useLiveGames.ts` sets `refetchInterval: 30_000` (plain number, correct for TanStack Query v5). `lastUpdatedLabel` derived from `query.dataUpdatedAt` (not removed `onSuccess`). `dataUpdatedAt` is rendered in the page header. The 30-second refresh cycle and visible timestamp update require a running browser to confirm. |
| 4 | User can click a live match row and arrive at a match route (placeholder UI acceptable — wired for Phase 3) | VERIFIED (code), HUMAN NEEDED (visual) | `MatchRow.tsx` wraps the entire row in `<Link to={'/match/${game.match_id}'}/>` from `'react-router'`. `App.tsx` has `<Route path="/match/:matchId" element={<MatchPlaceholder />}/>`. `MatchPlaceholder.tsx` reads from `useQueryClient().getQueryData<LiveGamesResponse>(['live-games'])` and renders JSON. Click navigation requires live browser. |

**Score:** 4/4 truths verified in code

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `client/src/utils/gameState.ts` | getStatusLabel, getSeriesLabel pure functions | VERIFIED | Exports both functions. Explicit `=== 2/5/6` comparisons. 10 unit tests pass. |
| `client/src/utils/formatDuration.ts` | formatDuration pure function | VERIFIED | `Math.floor(seconds/60)` + `padStart(2,'0')`. 6 unit tests pass including zero-padding and 60-minute edge cases. |
| `client/src/hooks/useLiveGames.ts` | useLiveGames hook + groupByLeague named export | VERIFIED | Both exported as named functions. `EnrichedGame` and `LiveGamesResponse` interfaces exported. `refetchInterval: 30_000`, `dataUpdatedAt` used, no `onSuccess`. 5 unit tests pass. |
| `client/src/components/StatusTag.tsx` | Colored pill badge for match status | VERIFIED | `rounded-full px-2 py-1 text-xs font-normal`. Four colorMap entries: `bg-yellow-400/15`, `bg-green-400/15`, `bg-red-400/15`, `bg-gray-700/40`. Uses `clsx`. |
| `client/src/components/MatchRow.tsx` | Single match table row with Link wrapper | VERIFIED | `flex items-center gap-4 px-4 min-h-[44px]`. `Link` from `'react-router'`. `duration !== undefined` guard (not falsy). `radiant_team?.team_name ?? 'TBD'`. |
| `client/src/components/LeagueAccordion.tsx` | Collapsible tournament section | VERIFIED | `useState(true)` default expanded. `aria-expanded={isOpen}`. Unicode chevrons ▾/▸. `mb-4` spacing. |
| `client/src/components/SkeletonRow.tsx` | animate-pulse loading placeholder | VERIFIED | `animate-pulse` present. `min-h-[44px]` matching MatchRow dimensions. Two bars (flex-1 wide, w-16 narrow). |
| `client/src/components/ErrorBanner.tsx` | Full-width error bar | VERIFIED | `p-4 bg-red-950 border border-red-800 text-red-300`. Exact copy: "Could not load live matches — Valve API unreachable. Retrying in 30 seconds." |
| `client/src/pages/HomePage.tsx` | Home page — accordion grouping, loading/error/empty states | VERIFIED | Imports `useLiveGames`. Renders 5 SkeletonRows on `isLoading`. ErrorBanner on `isError && !isLoading`. Empty state: "No live matches right now" / "Valve reports no active tournament games. Check back during a scheduled event." Data state: `LeagueAccordion` per group. `lastUpdatedLabel` in header. |
| `client/src/pages/MatchPlaceholder.tsx` | Dev JSON dump at /match/:matchId | VERIFIED | `getQueryData<LiveGamesResponse>(['live-games'])`. "DEV PLACEHOLDER — Phase 3 will replace this view." (exact copy). "← Back to matches" link. `text-yellow-400 text-sm font-normal mb-4`. |
| `client/src/main.tsx` | QueryClientProvider + BrowserRouter wrapping | VERIFIED | `QueryClientProvider` outer, `BrowserRouter` inner (line 16 vs 17). `QueryClient` with `defaultOptions: { queries: { retry: 1 } }`. All imports from `'react-router'`. |
| `client/src/App.tsx` | Routes for / and /match/:matchId | VERIFIED | `Routes` + `Route path="/"` + `Route path="/match/:matchId"`. Imports from `'react-router'`. |
| `server/src/schemas/openDota.ts` | LeagueSchema with safeParse validation | VERIFIED | `LeagueSchema` with `.passthrough()`. All fields `.optional()`. `name: z.string().nullable().optional()`. |
| `server/src/services/openDotaApi.ts` | getLeagueName wrapped in cached() with TTL.HERO_STATS | VERIFIED | `cached('league:${leagueId}', TTL.HERO_STATS, ...)`. `LeagueSchema.safeParse(raw)`. Error logs use `res.status res.statusText` only (no URL). |
| `server/src/schemas/bff.ts` | EnrichedLiveGameSchema, LiveGamesResponseSchema, exported types | VERIFIED | `LiveGameSchema.extend({ league_name: z.string() })`. All four exports present: `EnrichedLiveGameSchema`, `LiveGamesResponseSchema`, `EnrichedLiveGame`, `LiveGamesResponse`. |
| `server/src/routes/live.ts` | GET /api/live/games with inline league enrichment | VERIFIED | Imports `getLeagueName`. `new Set` de-duplication. `Promise.all` for concurrent fetches. `"League #${id}"` fallback. Returns `c.json({ games: enriched })`. Route mounted at `/api/live` in `server/src/index.ts`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `server/src/routes/live.ts` | `server/src/services/openDotaApi.ts` | `import { getLeagueName }` | WIRED | Line 3: `import { getLeagueName } from '../services/openDotaApi.js'`. Used line 26. |
| `server/src/services/openDotaApi.ts` | `server/src/cache.ts` | `cached('league:${leagueId}', TTL.HERO_STATS, ...)` | WIRED | Line 40: `return cached('league:${leagueId}', TTL.HERO_STATS, () => fetchLeagueName(leagueId))` |
| `server/src/services/openDotaApi.ts` | `server/src/schemas/openDota.ts` | `LeagueSchema.safeParse(raw)` | WIRED | Line 25: `const parsed = LeagueSchema.safeParse(raw)` |
| `client/src/pages/HomePage.tsx` | `client/src/hooks/useLiveGames.ts` | `import { useLiveGames }` | WIRED | Line 4 import, line 7 usage: `const { isLoading, isError, grouped, lastUpdatedLabel } = useLiveGames()` |
| `client/src/components/MatchRow.tsx` | `react-router` | `Link to='/match/:matchId'` | WIRED | Line 1: `import { Link } from 'react-router'`. Used in JSX render. |
| `client/src/pages/MatchPlaceholder.tsx` | `@tanstack/react-query` | `useQueryClient().getQueryData(['live-games'])` | WIRED | Line 11: `const games = queryClient.getQueryData<LiveGamesResponse>(['live-games'])` |
| `client/src/main.tsx` | `QueryClientProvider` | wraps `BrowserRouter` (outer-to-inner) | WIRED | Lines 16-19: `QueryClientProvider` is the outer wrapper, `BrowserRouter` is inner. |
| `client/src/hooks/useLiveGames.ts` | `/api/live/games` | `fetch('/api/live/games')` in queryFn | WIRED | Line 23: `const res = await fetch('/api/live/games')`. Result used: `return res.json() as Promise<LiveGamesResponse>`. Returned to TanStack Query which passes it to `grouped` via `useMemo`. |
| `server/src/index.ts` | `server/src/routes/live.ts` | `app.route('/api/live', liveRoutes)` | WIRED | Line 15: `app.route('/api/live', liveRoutes)` — completes the `/api/live/games` route path. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `HomePage.tsx` | `grouped` (LeagueAccordion list) | `useLiveGames()` → `groupByLeague(query.data?.games ?? [])` → `fetch('/api/live/games')` → `getLiveLeagueGames()` (Valve API, 30s cache) + `getLeagueName()` (OpenDota, 6h cache) | Yes — real Valve API call wrapped in `cached()`, enriched with real OpenDota league names | FLOWING |
| `MatchPlaceholder.tsx` | `match` (JSON dump) | `useQueryClient().getQueryData(['live-games'])` — reads from TanStack Query cache populated by HomePage's `useLiveGames` | Yes — cache populated by same real upstream data flow | FLOWING (cache-dependent: requires HomePage to have fetched first) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 21 client unit tests pass | `cd client && npm test -- --run` | `3 passed (3), 21 passed (21)` | PASS |
| Client TypeScript compiles clean | `cd client && npx tsc --noEmit` | Exit 0, no output | PASS |
| Server TypeScript compiles clean | `cd server && npx tsc --noEmit` | Exit 0, no output | PASS |
| Live route mounted in server entry | grep `app.route('/api/live'` in index.ts | Found at line 15 | PASS |
| Visual rendering / auto-refresh / navigation | Requires running browser | N/A | SKIP — see Human Verification |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| HOME-01 | 02-02, 02-03, 02-04 | User sees list of live pro matches with team names, series score, status tag | SATISFIED | `MatchRow.tsx` renders all three. `getStatusLabel`/`getSeriesLabel` tested. BFF provides `league_name` and all game fields. 21 unit tests green. |
| HOME-02 | 02-02, 02-03, 02-04 | User sees active tournaments and can browse their matches | SATISFIED | `LeagueAccordion` groups matches per league. `groupByLeague` tested for grouping, insertion order, deduplication. BFF enriches with real league names (6h cache, fallback "League #id"). |
| HOME-03 | 02-03, 02-04 | Home page auto-refreshes every 30 seconds without user action | SATISFIED (code) / HUMAN NEEDED (behavior) | `refetchInterval: 30_000` set correctly for TanStack Query v5. `dataUpdatedAt` drives `lastUpdatedLabel`. Visual confirmation of refresh requires running browser. |

All three requirement IDs declared in plan frontmatter (HOME-01, HOME-02, HOME-03) are present in REQUIREMENTS.md with their descriptions verified. No orphaned requirements found — REQUIREMENTS.md maps HOME-01/02/03 exclusively to Phase 2, and all are claimed by plans 02-02, 02-03, and 02-04.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `client/src/pages/MatchPlaceholder.tsx` | 26 | "DEV PLACEHOLDER — Phase 3 will replace this view." | Info | Intentional — plan-specified placeholder per D-12. Phase 3 (Match Core) replaces this view. Not a stub; the JSON dump is real cached data from the live endpoint. |
| `client/src/hooks/useLiveGames.ts` | 50 | `onSuccess` in JSDoc comment | Info | JSDoc comment explains why `onSuccess` is NOT used (v5 breaking change). Not in executable code. No impact. |

No blockers or warning-level anti-patterns found. All stub-like patterns are intentional per design decisions.

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Dynamic polling stop when `game_state === 6` (post-game matches drain quota) | Phase 7 | Phase 7 success criterion: "Polling stops automatically (`refetchInterval === false`) once `game_state === 6` so finished matches stop draining upstream quotas" |

The static `refetchInterval: 30_000` in Phase 2 is correct per plan — the Phase 2 threat model explicitly accepts T-02-05 and defers dynamic stop to Phase 4/7 scope.

### Human Verification Required

#### 1. Home page visual rendering with live data

**Test:** Start the dev server (`npm run dev` at repo root) and navigate to `http://localhost:5173`.
**Expected:** Page title "Dota 2 Match Analyst" appears in green-400. If live Dota matches are active: accordion sections appear with league names as headers, each containing match rows showing team names, series score (e.g. "0-0 Bo3"), a colored status pill (yellow=Draft, green=Live, red=Post-game), and duration when available. If no live matches: "No live matches right now" empty state appears.
**Why human:** Visual rendering, DOM structure, and Tailwind class application cannot be verified without a running browser.

#### 2. Auto-refresh timestamp update

**Test:** After the page loads and displays matches, observe the "Updated H:MM AM/PM" timestamp in the top-right header. Wait approximately 30 seconds.
**Expected:** The timestamp updates to a new time automatically, without any user interaction. The match list may also update if the Valve API returns different data.
**Why human:** Time-based background polling behavior requires a live browser and real elapsed time to confirm.

#### 3. Match row click navigation

**Test:** Click any match row in the home page list.
**Expected:** Browser navigates to `/match/:matchId` URL. Page shows "DEV PLACEHOLDER — Phase 3 will replace this view." in yellow, a "← Back to matches" link in green, and raw JSON of the match below.
**Why human:** React Router client-side navigation and cache-lookup rendering require a live browser.

---

### Gaps Summary

No gaps found. All code-verifiable must-haves are confirmed in the actual source files:

- All 16 source files exist and are substantive (not placeholders)
- All key links are wired: BFF enrichment pipeline (Valve → OpenDota → cached response), client data hook (fetch → TanStack Query → groupByLeague → HomePage), and routing (main.tsx → App.tsx → HomePage/MatchPlaceholder)
- Data flows from real upstream APIs through the cache layer to the rendered components
- 21 unit tests pass confirming all pure logic functions work correctly
- Both TypeScript compilations exit clean (client and server)
- Requirements HOME-01, HOME-02, HOME-03 are all covered by implemented code

Pending items are visual/behavioral confirmation that require a running browser (3 human verification items above).

---

_Verified: 2026-04-24T01:42:00Z_
_Verifier: Claude (gsd-verifier)_
