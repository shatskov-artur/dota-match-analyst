---
phase: 01-foundations
plan: 02
subsystem: infra
tags: [redis, cache, env-validation, zod, ioredis, tdd]

# Dependency graph
requires: [01-01]
provides:
  - "server/src/env.ts — zod-validated env vars parsed at startup; fails fast on missing vars"
  - "server/src/cache.ts — cached() decorator wrapping all upstream calls + TTL constants"
  - "TTL.LIVE_MATCH=30, TTL.HERO_STATS=21600, TTL.PLAYER_STATS=900"
  - "Graceful Redis degradation — BFF stays up if Upstash is unreachable"
affects: [01-03, 01-04, 02-live-matches, 03-match-core, 04-draft-ux, 05-hero-intel, 06-win-prob]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zod safeParse at module load time — missing env var throws immediately with human-readable message"
    - "ioredis named import { Redis } from 'ioredis' (NodeNext ESM/CJS interop)"
    - "rediss://:TOKEN@HOST:PORT URL construction — embeds Upstash token as Redis AUTH password over TLS"
    - "Redis null guard: if redis === null, cached() falls through to fn() transparently"
    - "Error logs use err.message only — never log full Redis URL (contains embedded token per T-02-04)"

key-files:
  created:
    - server/src/env.ts
    - server/src/cache.ts
    - server/src/env.test.ts
    - server/src/cache.test.ts
  modified:
    - .env.example (renamed UPSTASH_REDIS_REST_URL/TOKEN to UPSTASH_REDIS_URL/TOKEN)

key-decisions:
  - "Named import { Redis } from 'ioredis' required for NodeNext module resolution (default import triggers TS2709)"
  - "Upstash token embedded as Redis AUTH password in URL: rediss://:TOKEN@HOST:PORT"
  - "Mock strategy: shared mockRedisInstance defined at module scope, reset via mockReset() in beforeEach"

# Metrics
duration: ~4min
completed: 2026-04-22
---

# Phase 1 Plan 02: Redis Cache Module Summary

**Zod env validation at startup (fail-fast on missing vars) and cached() Redis decorator with TTL constants for all upstream API calls**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-22T19:06:10Z
- **Completed:** 2026-04-22T19:09:37Z
- **Tasks:** 2
- **Files modified:** 4 created, 1 modified

## Accomplishments

- `server/src/env.ts` — parses `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN`, `VALVE_API_KEY` at module load via zod `safeParse`; missing vars throw immediately with a message naming each missing key and its source URL
- `server/src/cache.ts` — `cached(key, ttlSeconds, fn)` wraps any async fn with Redis get-before/set-after; degrades gracefully if Redis is down (null guard); propagates fn() errors without writing to Redis
- TTL constants `TTL.LIVE_MATCH=30`, `TTL.HERO_STATS=21600`, `TTL.PLAYER_STATS=900` exported as `as const`
- 13 unit tests passing across both modules (5 env + 8 cache)
- `npx tsc --noEmit` exits 0 — both files type-check cleanly under NodeNext

## Task Commits

Each task was committed via TDD (RED then GREEN):

1. **Task 1 RED: env tests** — `c472389` (test)
2. **Task 1 GREEN: env implementation** — `420be20` (feat)
3. **Task 2 RED: cache tests** — `112f737` (test)
4. **Task 2 GREEN: cache implementation** — `daf68aa` (feat)

## Files Created/Modified

- `server/src/env.ts` — zod EnvSchema, safeParse, fail-fast throw with issue list
- `server/src/env.test.ts` — 5 tests: missing UPSTASH_REDIS_URL, missing VALVE_API_KEY, all vars present, PORT default, PORT override
- `server/src/cache.ts` — Redis client init with TLS, TTL constants, cached() function
- `server/src/cache.test.ts` — 8 tests: TTL values, cache hit, cache miss + SET, double miss, fn() error propagation, Redis GET error degradation
- `.env.example` — renamed `UPSTASH_REDIS_REST_URL` → `UPSTASH_REDIS_URL` and `UPSTASH_REDIS_REST_TOKEN` → `UPSTASH_REDIS_TOKEN` to match ioredis conventions; added comment pointing to "ioredis" tab in Upstash console

## Decisions Made

- **Named import for ioredis:** `import { Redis } from 'ioredis'` — the default import (`import Redis from 'ioredis'`) triggers TS2709 ("Cannot use namespace as a type") under `"module": "NodeNext"`. Named import resolves cleanly.
- **URL construction:** Upstash Redis-protocol endpoint embedded as `rediss://:TOKEN@HOST:PORT` — token passed as Redis AUTH password, connection encrypted over TLS.
- **Vitest mock strategy:** `mockRedisInstance` defined at module scope (outside `vi.mock` factory closure), referenced directly in `beforeEach` via `mockReset()`. Avoids `__mockRedis` hack and works correctly across test isolation boundaries.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ioredis TypeScript import for NodeNext module resolution**
- **Found during:** Task 2 verification (`npx tsc --noEmit`)
- **Issue:** `import Redis from 'ioredis'` produces TS2709 / TS2351 under `"module": "NodeNext"` because ioredis is a CJS package without ESM exports — TypeScript cannot use the namespace as a constructor type via default import
- **Fix:** Changed to `import { Redis } from 'ioredis'` (named export), which resolves to the class correctly
- **Files modified:** `server/src/cache.ts`, `server/src/cache.test.ts` (mock updated to export `Redis` as named constructor)
- **Commits:** included in `daf68aa`

**2. [Rule 1 - Bug] Fixed vitest mock isolation — mockRedis.set called across tests**
- **Found during:** Task 2 GREEN phase when running both test files together
- **Issue:** Using `__mockRedis` as a side-channel on the ioredis mock module broke when tests ran together — the mock constructor returned a stale instance and call counts leaked between tests
- **Fix:** Defined `mockRedisInstance` at module scope outside `vi.mock`, exported `Redis` as named constructor returning it, reset via `mockReset()` in `beforeEach`
- **Files modified:** `server/src/cache.test.ts`
- **Commits:** included in `daf68aa`

## Threat Model Coverage

All T-02 threats mitigated as specified:

| Threat | Status |
|--------|--------|
| T-02-01: Token in env var | Mitigated — `.env` gitignored, `.env.example` has placeholders only, token sent as Redis AUTH over TLS |
| T-02-02: Redis down blocks all requests | Mitigated — `cached()` null-guards redis client, falls through to fn() |
| T-02-03: Stale cache | Accepted — 30s TTL for live data documented in D-08 |
| T-02-04: Token exposed in logs | Mitigated — `err.message` logged only, never the full Redis URL |

## Known Stubs

None — both modules are fully implemented with no placeholder values.

## Threat Flags

None — no new security surface beyond what is in the plan's threat model.

## Next Phase Readiness

- Plans 01-03 and 01-04 (shared primitives: heroMapper, buildingDecoder, hiddenProfile) can begin immediately
- `import { cached, TTL } from '../cache.js'` is ready for use in all BFF route handlers
- `import { env } from '../env.js'` provides typed env access without `process.env` casting anywhere else

---
*Phase: 01-foundations*
*Completed: 2026-04-22*
