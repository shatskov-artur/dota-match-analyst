---
phase: 07-in-game-item-intel
plan: "01"
subsystem: shared/items + client test stubs
tags: [tdd, static-data, items, vitest]
dependency_graph:
  requires: []
  provides: [shared/items.json, itemMapper.test.ts RED, formatNW.test.ts RED]
  affects: [07-02-PLAN (itemMapper GREEN), 07-03-PLAN (formatNW GREEN)]
tech_stack:
  added: []
  patterns: [OpenDota constants snapshot, RED-state TDD stubs]
key_files:
  created:
    - shared/items.json
    - client/src/utils/itemMapper.test.ts
    - client/src/utils/formatNW.test.ts
  modified: []
decisions:
  - "radiance item id is 137 (not 119 as in plan) — plan used stale data; test corrected to id=137"
  - "items.json snapshot contains 501 items as of 2026-04-28"
metrics:
  duration: "68s"
  completed: "2026-04-28"
  tasks_completed: 2
  files_created: 3
  files_modified: 0
---

# Phase 7 Plan 01: items.json Download + RED-State Test Stubs Summary

Wave 0 prerequisite: downloaded OpenDota constants snapshot (501 items) and wrote failing RED-state test stubs for itemMapper and formatNW utils.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Download shared/items.json | 886fa64 | shared/items.json |
| 2 | Write RED-state test stubs | a9b1fe7 | client/src/utils/itemMapper.test.ts, client/src/utils/formatNW.test.ts |

## Verification Results

- `shared/items.json`: 501 items, blink.id===1, no "0" key, no "item_" prefix keys, 344KB
- `itemMapper.test.ts`: 4 test cases, fails with "module not found" (RED confirmed)
- `formatNW.test.ts`: 5 test cases, fails with "module not found" (RED confirmed)
- Existing test suite: 9 files pass, 67 tests pass — no regressions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected radiance item ID in itemMapper test**
- **Found during:** Task 2, verification of items.json
- **Issue:** Plan specified `itemMapper(119) returns "radiance"` but actual OpenDota data shows radiance.id === 137; id 119 maps to "shivas_guard"
- **Fix:** Changed test 4 to `itemMapper(137) returns "radiance"` using correct id from downloaded items.json
- **Files modified:** client/src/utils/itemMapper.test.ts
- **Commit:** a9b1fe7

## TDD Gate Compliance

- RED gate: test(07-01) commit a9b1fe7 — both test files fail with module-not-found
- GREEN gate: not yet — will be in 07-02-PLAN (itemMapper) and 07-03-PLAN (formatNW)

## Known Stubs

None — this plan intentionally produces RED-state tests (stubs by design, to be wired in 07-02/07-03).

## Self-Check: PASSED

- shared/items.json: FOUND
- client/src/utils/itemMapper.test.ts: FOUND
- client/src/utils/formatNW.test.ts: FOUND
- Commit 886fa64: FOUND
- Commit a9b1fe7: FOUND
