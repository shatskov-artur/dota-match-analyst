---
phase: 06-win-probability
plan: "02"
subsystem: server
tags: [stratz, win-probability, caching, zod, tdd-green]
dependency_graph:
  requires:
    - server/src/env.ts
    - server/src/cache.ts
    - server/src/schemas/openDota.ts (pattern reference)
    - server/src/services/stratzApi.test.ts (from 06-01 RED)
    - server/src/services/intel.test.ts (from 06-01 RED)
  provides:
    - server/src/schemas/stratz.ts
    - server/src/services/stratzApi.ts
    - STRATZ_TOKEN in EnvSchema
    - TTL.WIN_PROB = 60 in cache.ts
    - rankCountersStratz in intel.ts
  affects:
    - Plan 06-03 (win probability route will import getWinProbability)
    - Plan 06-04 (useWinProbability hook will call /api/winprob endpoint)
tech_stack:
  added: []
  patterns:
    - Stratz GraphQL POST with Bearer token (server-side only, T-6-01)
    - cached() wrapper with content-keyed cache keys (T-6-02 DoS mitigation)
    - All zod schemas .passthrough() + .optional() per CLAUDE.md Key Patterns
    - null-return error pattern: network error | !res.ok | parse failure | empty array → null
    - rankCountersStratz: flatMap nested vs[] → filter → sort ascending → slice(0,3) → map disadvantageScore
key_files:
  created:
    - server/src/schemas/stratz.ts
    - server/src/services/stratzApi.ts
  modified:
    - server/src/env.ts
    - server/src/cache.ts
    - server/src/services/intel.ts
    - server/src/env.test.ts
decisions:
  - STRATZ_TOKEN required field in EnvSchema (.min(1)) — server refuses to start without it (T-6-03)
  - TTL.WIN_PROB = 60s chosen as D-07: 2× the 30s client poll cadence — every poll gets fresh data with 1 Stratz call/min/match
  - bracketBasicIds DIVINE_IMMORTAL used in hero matchups query (Finding 4 — PROFESSIONAL enum value does not exist)
  - rankCountersStratz uses first vs[] entry per advantage entry (Finding 3 — nested bracket grouping)
metrics:
  duration: "208s"
  completed_date: "2026-04-26"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 4
---

# Phase 06 Plan 02: Server-Side Stratz Services Summary

**One-liner:** Stratz GraphQL service layer with env token validation, 60s win-probability cache, zod schemas for nested GraphQL responses, and rankCountersStratz pure transform — turning all 06-01 RED tests GREEN.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | env.ts + cache.ts + stratz.ts schemas | c1377c7 | server/src/env.ts, server/src/cache.ts, server/src/schemas/stratz.ts |
| 2 | stratzApi.ts service + rankCountersStratz in intel.ts | d35eb07 | server/src/services/stratzApi.ts, server/src/services/intel.ts, server/src/env.test.ts |

## Test Results

### Before this plan (RED state from 06-01)
- `stratzApi.test.ts`: 4 tests FAILING (module not found)
- `intel.test.ts`: 4 tests FAILING (rankCountersStratz not exported)
- `env.test.ts`: 3 tests FAILING (STRATZ_TOKEN missing from test env setup)

### After this plan (GREEN)
- `stratzApi.test.ts`: 4/4 PASSING
- `intel.test.ts`: 13/13 PASSING (9 existing + 4 new rankCountersStratz)
- `env.test.ts`: 5/5 PASSING
- Full server suite: **38/38 PASSING**
- TypeScript: **clean (0 errors)**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] env.test.ts broken by STRATZ_TOKEN addition**
- **Found during:** Task 2 — full suite run after implementing stratzApi.ts
- **Issue:** env.test.ts did not include STRATZ_TOKEN in any test setup, causing 3 tests to throw "Missing required environment variables: STRATZ_TOKEN" because all previous tests only set the original 3 required vars
- **Fix:** Added `STRATZ_TOKEN: 'test-stratz-token'` to the REQUIRED_VARS constant and propagated it to all 5 test cases + afterEach cleanup
- **Files modified:** server/src/env.test.ts
- **Commit:** d35eb07 (included in Task 2 commit)

## Known Stubs

None — all service functions are fully implemented. The `.env` placeholder `STRATZ_TOKEN=replace-with-real-token-from-stratz.com-api` is intentional and documented: the real token must be obtained from stratz.com/api before the server can make live Stratz calls.

## Threat Flags

None — all T-6-01 through T-6-04 mitigations implemented as specified in the plan's threat model:
- T-6-01: STRATZ_TOKEN only in Authorization header, never logged
- T-6-02: Cache keys `stratz:winprob:{matchId}` and `stratz:matchups:{heroId}` — content-keyed, never per-user
- T-6-03: STRATZ_TOKEN .min(1) required — server refuses to start without it
- T-6-04: Error paths log status/message only, never forward Stratz response body

## Self-Check: PASSED

- `server/src/schemas/stratz.ts` — FOUND
- `server/src/services/stratzApi.ts` — FOUND
- `server/src/services/intel.ts` — FOUND (modified, rankCountersStratz exported)
- `server/src/env.ts` — FOUND (STRATZ_TOKEN added)
- `server/src/cache.ts` — FOUND (WIN_PROB: 60 added)
- Commit c1377c7 — FOUND
- Commit d35eb07 — FOUND
- Full server suite 38/38 GREEN — CONFIRMED
- TypeScript clean — CONFIRMED
