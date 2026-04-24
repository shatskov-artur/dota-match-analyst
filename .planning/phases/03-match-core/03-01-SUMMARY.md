---
phase: 03-match-core
plan: "01"
subsystem: client-utils, server-schemas
tags: [hero-mapper, gold-diff, valve-schema, browser-compat, tdd]
dependency_graph:
  requires: []
  provides:
    - client/src/utils/heroMapper.ts (browser-safe hero ID → name+portrait mapping)
    - client/src/utils/formatGoldDiff.ts (net-worth gold diff formatter with color)
    - client/src/utils/formatGoldDiff.test.ts (6 vitest unit tests)
    - server/src/schemas/valve.ts PlayerSchema extended with D-08 fields
  affects:
    - All Wave 2+ components that render hero portraits (unblocked by heroMapper)
    - ScoreHeader (consumes formatGoldDiff)
    - PlayerRow (consumes heroMapper, extended PlayerSchema type)
tech_stack:
  added: []
  patterns:
    - Vite native JSON import for browser-safe static data access
    - Intl.NumberFormat('en-US') for locale-safe comma formatting
key_files:
  created:
    - client/src/utils/heroMapper.ts
    - client/src/utils/formatGoldDiff.ts
    - client/src/utils/formatGoldDiff.test.ts
  modified:
    - server/src/schemas/valve.ts
decisions:
  - "Used Intl.NumberFormat('en-US') instead of toLocaleString() — system locale (Russian) formats numbers with spaces, breaking tests"
  - "heroMapper comment-only reference to createRequire is acceptable — import statement uses Vite JSON import"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-24T18:05:51Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 1
---

# Phase 3 Plan 1: Browser-Safe Utilities and Schema Foundation Summary

**One-liner:** Browser-safe heroMapper via Vite JSON import, formatGoldDiff utility with locale-fixed comma formatting, and PlayerSchema extended with 5 optional D-08 stat fields.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create browser-safe heroMapper | 644a09e | client/src/utils/heroMapper.ts (created) |
| 2 | Create formatGoldDiff utility + unit tests | bbded46 | client/src/utils/formatGoldDiff.ts, formatGoldDiff.test.ts (created) |
| 3 | Extend valve.ts PlayerSchema with D-08 stats | c93d019 | server/src/schemas/valve.ts (modified) |

## Verification

- `cd client && npx vitest run` — 27 tests, 4 files, all passed
- `client/src/utils/heroMapper.ts` contains `import heroes from '../../../shared/heroes.json'` — no `createRequire` in import statement
- `server/src/schemas/valve.ts` PlayerSchema contains `level`, `gpm`, `xpm`, `lh`, `dn` as `z.number().optional()` with `.passthrough()` intact

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed locale-dependent number formatting in formatGoldDiff**
- **Found during:** Task 2 verification (first vitest run)
- **Issue:** `toLocaleString()` uses the system locale. On this machine (Russian locale), numbers format with spaces as thousands separators (`5 000`) instead of commas (`5,000`), causing 4 of 6 tests to fail.
- **Fix:** Replaced `diff.toLocaleString()` with `new Intl.NumberFormat('en-US').format(diff)` to force en-US comma-separated formatting regardless of system locale.
- **Files modified:** `client/src/utils/formatGoldDiff.ts`
- **Commit:** bbded46 (included in same task commit)
- **Research note:** RESEARCH.md assumption A2 anticipated this risk — "Use explicit `Intl.NumberFormat` if needed."

## Known Stubs

None — all exported functions are fully implemented and tested.

## Threat Flags

None — plan's threat model accepted all surfaces (static JSON bundle, pure number formatting). No new surfaces introduced.

## Self-Check: PASSED

- `client/src/utils/heroMapper.ts` — FOUND
- `client/src/utils/formatGoldDiff.ts` — FOUND
- `client/src/utils/formatGoldDiff.test.ts` — FOUND
- `server/src/schemas/valve.ts` contains `level: z.number().optional()` — FOUND
- Commit 644a09e — FOUND
- Commit bbded46 — FOUND
- Commit c93d019 — FOUND
