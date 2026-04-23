---
phase: 02-live-matches-list
plan: 04
subsystem: client-components-pages
tags: [react, tailwind, react-router-v7, tanstack-query-v5, ui-components, routing]
dependency_graph:
  requires:
    - 02-01 (Wave 0 RED test stubs)
    - 02-02 (BFF enrichment — EnrichedGame shape)
    - 02-03 (client utils + useLiveGames hook)
  provides:
    - client/src/components/StatusTag.tsx
    - client/src/components/MatchRow.tsx
    - client/src/components/LeagueAccordion.tsx
    - client/src/components/SkeletonRow.tsx
    - client/src/components/ErrorBanner.tsx
    - client/src/pages/HomePage.tsx
    - client/src/pages/MatchPlaceholder.tsx
    - client/src/main.tsx
    - client/src/App.tsx
  affects:
    - Phase 3 (Match Core) — imports from components and pages directories
tech_stack:
  added: []
  patterns:
    - React Router v7 declarative mode — all imports from 'react-router' (not 'react-router-dom')
    - QueryClientProvider (outer) wraps BrowserRouter (inner) for future router-level prefetching
    - TanStack Query getQueryData for cache-only lookup in MatchPlaceholder (no extra BFF call)
    - clsx for conditional Tailwind class composition
    - Unicode chevrons (▾/▸) for accordion — no icon library installed
key_files:
  created:
    - client/src/components/StatusTag.tsx
    - client/src/components/MatchRow.tsx
    - client/src/components/LeagueAccordion.tsx
    - client/src/components/SkeletonRow.tsx
    - client/src/components/ErrorBanner.tsx
    - client/src/pages/HomePage.tsx
    - client/src/pages/MatchPlaceholder.tsx
  modified:
    - client/src/main.tsx
    - client/src/App.tsx
decisions:
  - "All React Router imports use 'react-router' (not 'react-router-dom') per React Router v7 declarative mode"
  - "QueryClientProvider wraps BrowserRouter (outer-to-inner) to allow router-level prefetching in Phase 4+"
  - "duration guard uses !== undefined (not falsy) per D-04 — game time 0 is valid and must render"
  - "MatchPlaceholder reads from TanStack Query cache only — no second BFF call for match detail data"
  - "Unicode chevrons used for accordion (▾/▸) — no icon library installed in project"
metrics:
  duration: ~15 minutes
  completed: "2026-04-23T19:19:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 7
  files_modified: 2
---

# Phase 02 Plan 04: React Components, Pages, and Routing Summary

**One-liner:** Nine files wiring the full Phase 2 UI — five Tailwind components (StatusTag/MatchRow/LeagueAccordion/SkeletonRow/ErrorBanner), two pages (HomePage/MatchPlaceholder), and main.tsx+App.tsx routing with QueryClientProvider wrapping BrowserRouter.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Build StatusTag, MatchRow, LeagueAccordion, SkeletonRow, ErrorBanner components | 51e525c | 5 new component files |
| 2 | Build HomePage, MatchPlaceholder pages and wire main.tsx + App.tsx routing | af672ae | 2 new page files, 2 modified entry files |

## What Was Built

### client/src/components/StatusTag.tsx
- Rounded-full pill badge with `px-2 py-1 text-xs font-normal` per UI-SPEC
- Four-entry colorMap: Draft→yellow-400/15, Live→green-400/15, Post-game→red-400/15, Unknown→gray-700/40
- Uses `clsx` for conditional class composition

### client/src/components/MatchRow.tsx
- Horizontal flex row: `flex items-center gap-4 px-4 min-h-[44px]`
- `Link` from `'react-router'` (not react-router-dom) wraps entire row
- Team name fallback: `game.radiant_team?.team_name ?? 'TBD'` (optional chaining + nullish coalescing)
- Duration guard: `game.duration !== undefined` (not `game.duration &&`) — preserves 0:00 rendering per D-04
- Right-aligned series score + StatusTag + duration via `ml-auto flex items-center gap-3`

### client/src/components/LeagueAccordion.tsx
- `useState(true)` default — all sections expanded on mount per D-07
- Keyboard-accessible `<button>` header with `aria-expanded={isOpen}`
- Unicode chevrons ▾/▸ — no icon library needed
- Section spacing: `mb-4` between accordion groups

### client/src/components/SkeletonRow.tsx
- `animate-pulse` bars matching MatchRow `min-h-[44px]` dimensions
- Wide bar (flex-1) for team names area + narrow bar (w-16) for tag area

### client/src/components/ErrorBanner.tsx
- Full-width: `p-4 bg-red-950 border border-red-800 text-red-300`
- Exact copywriting contract: "Could not load live matches — Valve API unreachable. Retrying in 30 seconds."

### client/src/pages/HomePage.tsx
- Page header: `flex items-center justify-between px-8 py-6 border-b border-gray-800`
- Title: `text-green-400 text-2xl font-bold` "Dota 2 Match Analyst"
- `lastUpdatedLabel` shown in `text-gray-400 text-xs font-normal` (null-guarded — absent before first fetch)
- Loading: 5 SkeletonRows via `Array.from({ length: 5 })`
- Error: ErrorBanner shown when `isError && !isLoading`
- Empty: exact copy "No live matches right now" / "Valve reports no active tournament games. Check back during a scheduled event."
- Data: LeagueAccordion per grouped league

### client/src/pages/MatchPlaceholder.tsx
- `useParams()` for matchId from URL
- `useQueryClient().getQueryData<LiveGamesResponse>(['live-games'])` — cache-only lookup, no BFF call
- `String(g.match_id) === matchId` for type-safe comparison
- Dev label: `text-yellow-400 text-sm font-normal mb-4` with exact copy "DEV PLACEHOLDER — Phase 3 will replace this view."
- Back link: `← Back to matches` in `text-green-400 text-sm hover:underline mb-6 inline-block`

### client/src/main.tsx
- `QueryClientProvider` (outer) → `BrowserRouter` (inner) → `App`
- `QueryClient` with `defaultOptions: { queries: { retry: 1 } }`
- All imports from `'react-router'`

### client/src/App.tsx
- `Routes` with `Route path="/"` and `Route path="/match/:matchId"`
- All imports from `'react-router'`

## Verification

TypeScript checks:
- `client/`: `npx tsc --noEmit` → exit 0 (clean)
- `server/`: `npx tsc --noEmit` → exit 0 (clean)

Client test suite:
```
Test Files  3 passed (3)
      Tests  21 passed (21)
```
- gameState.test.ts: 10/10
- formatDuration.test.ts: 6/6
- useLiveGames.test.ts: 5/5

All acceptance criteria from both tasks met.

## Deviations from Plan

None — both tasks executed exactly as written in the plan. All UI-SPEC class strings and copywriting contract strings implemented verbatim.

## Known Stubs

`MatchPlaceholder` is intentionally a dev stub — it shows raw JSON from the TanStack Query cache. This is the plan's stated goal (D-12) and is documented with an explicit "DEV PLACEHOLDER" label visible in the UI. Phase 3 (Match Core) will replace this view.

No unintentional stubs — all data flows are wired to real sources.

## Threat Flags

No new threat surface beyond the plan's threat model:
- T-02-03: league_name and team_name rendered as React text nodes (XSS: accept — React escapes JSX interpolation)
- T-02-07: matchId used only for client-side cache lookup, never sent to BFF (injection: accept)
- T-02-08: raw JSON dump exposes public tournament data — intentional for dev phase (info disclosure: accept)
- T-02-05: 30s polling — Phase 4 scope for dynamic stop on game_state === 6 (DoS: accept)

## Self-Check

Files created:
- client/src/components/StatusTag.tsx: FOUND
- client/src/components/MatchRow.tsx: FOUND
- client/src/components/LeagueAccordion.tsx: FOUND
- client/src/components/SkeletonRow.tsx: FOUND
- client/src/components/ErrorBanner.tsx: FOUND
- client/src/pages/HomePage.tsx: FOUND
- client/src/pages/MatchPlaceholder.tsx: FOUND

Files modified:
- client/src/main.tsx: FOUND
- client/src/App.tsx: FOUND

Commits:
- 51e525c: FOUND
- af672ae: FOUND

## Self-Check: PASSED
