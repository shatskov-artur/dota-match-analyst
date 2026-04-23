---
phase: 02-live-matches-list
plan: 01
subsystem: client-tests
tags: [tdd, red-phase, vitest, wave-0]
dependency_graph:
  requires: []
  provides:
    - client/src/utils/gameState.test.ts
    - client/src/utils/formatDuration.test.ts
    - client/src/hooks/useLiveGames.test.ts
  affects:
    - Wave 1 (02-02) — BFF enrichment route
    - Wave 2 (02-03) — source file implementations that turn these green
tech_stack:
  added: []
  patterns:
    - vitest ^2.0.0 test runner (existing, not new)
    - TDD RED phase: test stubs fail with module-not-found before source files exist
key_files:
  created:
    - client/src/utils/gameState.test.ts
    - client/src/utils/formatDuration.test.ts
    - client/src/hooks/useLiveGames.test.ts
  modified: []
decisions:
  - groupByLeague exported as named export (not default) from useLiveGames.ts to enable unit testing without React context
  - Test file imports use relative paths matching the exact paths Wave 2 will create source files at
metrics:
  duration: ~5 minutes
  completed: "2026-04-23T19:05:30Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 0
---

# Phase 02 Plan 01: TDD Wave 0 — Failing Test Stubs Summary

**One-liner:** Three vitest test stubs in RED state covering gameState labels, MM:SS duration formatting, and league grouping logic — source files intentionally absent until Wave 2.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write gameState.test.ts stubs (RED) | b567c70 | client/src/utils/gameState.test.ts |
| 2 | Write formatDuration.test.ts stubs (RED) | 3be336b | client/src/utils/formatDuration.test.ts |
| 3 | Write useLiveGames.test.ts stubs (RED) | cf9389e | client/src/hooks/useLiveGames.test.ts |

## What Was Built

### gameState.test.ts (10 test cases)
- `getStatusLabel`: game_state 2→Draft, 5→Live, 6→Post-game, other→Unknown, undefined→Unknown
- `getSeriesLabel`: series_type 0→Bo1, 1→Bo3, 2→Bo5, other→"", undefined→""

### formatDuration.test.ts (6 test cases)
- MM:SS format, zero-padding, 0→"0:00", 65→"1:05", 754→"12:34", 3600→"60:00", 59→"0:59", 60→"1:00"

### useLiveGames.test.ts (5 test cases)
- `groupByLeague` pure helper: empty array, single game, same-league dedup, two leagues, insertion-order preservation
- Imports as named export `{ groupByLeague }` from `'../hooks/useLiveGames'`

## Verification

All three test files fail with `Error: Failed to load url` (module not found) — RED state confirmed:

```
Test Files  3 failed (3)
      Tests  no tests
```

No source files created. Wave 1 (02-02) writes BFF code; Wave 2 (02-03) writes source files that turn these tests green.

## Deviations from Plan

**Deviation: npm install required in worktree**
- **Found during:** Task 1 verification
- **Issue:** Worktree `client/` directory had no `node_modules` — vitest could not run
- **Fix:** Ran `npm install` in the worktree client directory (Rule 3 — blocking issue)
- **Files modified:** `client/node_modules/` (not committed — generated output)
- **Impact:** None on plan output; test stubs and RED state are unaffected

## Known Stubs

None — this plan creates test files only. No production code stubs introduced.

## Threat Flags

None — Wave 0 creates test files only; no production code, no network endpoints, no trust boundaries.

## TDD Gate Compliance

Plan type is `tdd`. This plan is the RED gate only — all three commits are `test(02-01):` commits establishing the RED state. GREEN gate will be in Wave 2 plan (02-03) when source files are implemented.

- RED gate: b567c70, 3be336b, cf9389e (this plan)
- GREEN gate: Wave 2 plan 02-03 (pending)

## Self-Check

Files created:
- client/src/utils/gameState.test.ts: FOUND
- client/src/utils/formatDuration.test.ts: FOUND
- client/src/hooks/useLiveGames.test.ts: FOUND

Commits:
- b567c70: FOUND
- 3be336b: FOUND
- cf9389e: FOUND

## Self-Check: PASSED
