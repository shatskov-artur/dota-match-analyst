---
phase: 02-live-matches-list
plan: 03
subsystem: client-utils-hooks
tags: [tdd, green-phase, vitest, wave-2, tanstack-query-v5, date-fns]
dependency_graph:
  requires:
    - 02-01 (Wave 0 RED test stubs)
    - 02-02 (BFF enrichment — EnrichedGame shape)
  provides:
    - client/src/utils/gameState.ts
    - client/src/utils/formatDuration.ts
    - client/src/hooks/useLiveGames.ts
  affects:
    - Wave 3 (02-04) — page components import these modules
tech_stack:
  added: []
  patterns:
    - TanStack Query v5 useQuery with refetchInterval plain number (not callback)
    - date-fns v4 format() for lastUpdatedLabel timestamp display
    - Map<number,...> for insertion-order-preserving league grouping
    - Pure exported function (groupByLeague) enables unit testing without React context
key_files:
  created:
    - client/src/utils/gameState.ts
    - client/src/utils/formatDuration.ts
    - client/src/hooks/useLiveGames.ts
  modified: []
decisions:
  - refetchInterval set to plain number 30_000 per TanStack Query v5 breaking change (callback form was v4)
  - dataUpdatedAt used instead of removed onSuccess for last-fetch timestamp
  - groupByLeague exported as named function (not default) for isolated unit testing
  - Map<number,...> keyed by league_id number (not string) for type correctness
  - onSuccess appears only in JSDoc comment explaining the v5 breaking change, not in executable code
metrics:
  duration: ~5 minutes
  completed: "2026-04-23T19:14:06Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 0
---

# Phase 02 Plan 03: Client Utilities and useLiveGames Hook Summary

**One-liner:** Three client-side modules turning Wave 0 test stubs GREEN — gameState label mappers, MM:SS duration formatter, and TanStack Query v5 useLiveGames hook with extracted groupByLeague pure helper.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement gameState.ts and formatDuration.ts (turn tests GREEN) | 2de8e34 | client/src/utils/gameState.ts, client/src/utils/formatDuration.ts |
| 2 | Implement useLiveGames.ts hook (turn groupByLeague tests GREEN) | 8b45685 | client/src/hooks/useLiveGames.ts |

## What Was Built

### client/src/utils/gameState.ts
- `getStatusLabel(gameState)` — maps 2→'Draft', 5→'Live', 6→'Post-game', anything else→'Unknown'
- `getSeriesLabel(seriesType)` — maps 0→'Bo1', 1→'Bo3', 2→'Bo5', anything else→''
- Explicit `===` comparisons per plan spec (no lookup table)
- Return type annotated as union literal for TypeScript safety

### client/src/utils/formatDuration.ts
- `formatDuration(seconds)` — converts seconds to "M:SS" string with `Math.floor` + `padStart(2,'0')`
- Minutes are unbounded (no hour rollover) — correct for Dota 2 matches exceeding 60 minutes
- Handles 0→'0:00', 65→'1:05', 754→'12:34', 3600→'60:00'

### client/src/hooks/useLiveGames.ts
- `EnrichedGame` interface — matches BFF response shape from 02-02
- `LiveGamesResponse` interface — `{ games: EnrichedGame[] }`
- `groupByLeague(games)` — pure named export, groups by `league_id` via `Map<number,...>`, preserves insertion order
- `fetchLiveGames()` — private fetch function, throws on non-ok HTTP status
- `useLiveGames()` — TanStack Query v5 hook:
  - `refetchInterval: 30_000` (plain number — v5 breaking change from callback in v4)
  - `staleTime: 25_000` to avoid redundant re-renders
  - `lastUpdatedLabel` derived from `query.dataUpdatedAt` (no `onSuccess` — removed in v5)
  - `grouped` via `useMemo` over `groupByLeague(query.data?.games ?? [])`

## Verification

All three test files GREEN after implementation:

```
Test Files  3 passed (3)
      Tests  21 passed (21)
```

Individual results:
- `gameState.test.ts`: 10/10 tests passed
- `formatDuration.test.ts`: 6/6 tests passed
- `useLiveGames.test.ts`: 5/5 tests passed (groupByLeague only — hook internals tested via integration in Plan 04)

Wave 0 TDD cycle complete: RED (02-01) → GREEN (02-03).

## Deviations from Plan

**Deviation: npm install required in worktree**
- **Found during:** Task 1 verification
- **Issue:** Worktree `client/` had no `node_modules/` — vitest could not run (same as 02-01)
- **Fix:** Ran `npm install` in the worktree client directory (Rule 3 — blocking issue)
- **Files modified:** `client/node_modules/` (not committed — generated output)
- **Impact:** None on plan output; source files and GREEN state are unaffected

No other deviations — both tasks executed exactly as written in the plan.

## Known Stubs

None — all exports are fully implemented:
- `getStatusLabel` and `getSeriesLabel`: real logic, no hardcoded returns
- `formatDuration`: real formula
- `groupByLeague`: real Map-based grouping
- `useLiveGames`: real TanStack Query hook wired to `/api/live/games`

## Threat Flags

No new threat surface beyond the plan's threat model. T-02-03, T-02-05, T-02-06 accepted per plan:
- React JSX text node rendering escapes all interpolated values (XSS accept)
- Static 30_000ms polling interval (DoS accept — dynamic stop deferred to Phase 4)
- No auth vectors in Phase 2 read-only public data hook (EoP accept)

## TDD Gate Compliance

Plan type is `execute` with `tdd="true"` on tasks. This plan is the GREEN gate:

- RED gate: 02-01 commits b567c70, 3be336b, cf9389e (Wave 0)
- GREEN gate: this plan commits 2de8e34, 8b45685 (Wave 2)
- REFACTOR: not needed — implementations are minimal and clean

TDD cycle complete for all three Wave 0 test files.

## Self-Check

Files created:
- client/src/utils/gameState.ts: FOUND
- client/src/utils/formatDuration.ts: FOUND
- client/src/hooks/useLiveGames.ts: FOUND

Commits:
- 2de8e34: FOUND
- 8b45685: FOUND

## Self-Check: PASSED
