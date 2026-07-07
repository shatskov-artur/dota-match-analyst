---
phase: 11-harden-deploy
plan: 01
subsystem: infra
tags: [rate-limiting, p-queue, p-retry, backoff, caching, pino, redis, stratz, opendota, valve]

# Dependency graph
requires:
  - phase: 01-foundations
    provides: "cached() Redis chokepoint, TTL constants, pino logger, env schema"
  - phase: 02-06
    provides: "valveApi/openDotaApi/stratzApi service call-sites routing through cached()"
provides:
  - "Per-upstream p-queue rate-limit envelope (valveQueue/openDotaQueue/stratzQueue)"
  - "cached() 429 exponential backoff with Retry-After honoring (p-retry)"
  - "Stale-cache-on-exhaustion fallback (stale:<key>, 24h) → route 503 only when no stale exists"
  - "Structured status-only throttle logging (logThrottle) with no secret leakage"
affects: [11-harden-deploy remaining plans, deploy]

# Tech tracking
tech-stack:
  added: [p-queue, p-retry]
  patterns:
    - "Per-upstream PQueue safety envelope layered on top of cached() collapse"
    - "429-only retry gating via p-retry shouldRetry (never retry ZodError/404)"
    - "Two-key cache write (fresh key + long-lived stale:<key>) for exhaustion fallback"
    - "Status-only structured logging — throttle logs carry no url/key/token"

key-files:
  created:
    - server/src/queues.ts
    - server/src/queues.test.ts
    - server/src/services/retryAfter.ts
  modified:
    - server/src/cache.ts
    - server/src/cache.test.ts
    - server/src/logger.ts
    - server/src/services/valveApi.ts
    - server/src/services/openDotaApi.ts
    - server/src/services/stratzApi.ts
    - server/package.json

key-decisions:
  - "Extracted parseRetryAfter into a shared services/retryAfter.ts helper instead of duplicating it in three services"
  - "openDota catch blocks rethrow status===429 so the retryable error reaches cached()'s pRetry while non-429 errors keep the value|null contract"
  - "TTL.STALE = 86_400 (24h) as the conservative, owner-tunable stale-copy lifetime"

patterns-established:
  - "Rate-limit queue lives inside cached() — call-sites only pass { queue, upstream }; fetch is never queued outside a fetchXxx()"
  - "429 handlers throw { status: 429, retryAfterMs }; all other failures preserve prior throw/null behavior"

requirements-completed: []

# Metrics
duration: ~35min
completed: 2026-07-07
---

# Phase 11 Plan 01: Upstream Rate-Limit Hardening Summary

**Per-upstream p-queue envelope + 429 exponential backoff (Retry-After honored) + 24h stale-cache-on-exhaustion fallback + status-only pino throttle logging, all funneled through the single `cached()` chokepoint.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-07T19:59:00Z (approx)
- **Completed:** 2026-07-07T20:34:25Z
- **Tasks:** 3
- **Files modified:** 10 (3 created, 7 modified)

## Accomplishments
- Three named PQueue instances (valve/openDota/stratz) sized per RESEARCH Queue Config Math; Stratz serialized (intervalCap:1) as the binding 500/hr constraint.
- `cached()` extended with a backward-compatible 4th `{ queue, upstream }` arg: fetch runs inside the upstream's queue, 429s retry with exponential backoff (retries:4, factor:2, max 30s), non-429s never retry.
- Stale-cache fallback: every successful miss writes both `key` (normal TTL) and `stale:<key>` (24h); on retry exhaustion `cached()` serves the stale copy if present, otherwise rethrows so the route emits 503 — never blocks indefinitely (D-03).
- `logThrottle()` emits one structured pino warn per failed attempt with `{ upstream, attempt, retriesLeft, status, delayMs }` and provably no url/key/token (T-11-02), asserted by test.
- All three services throw a retryable `{ status: 429, retryAfterMs }` on 429 (via shared `parseRetryAfter`) while preserving their existing throw (valve) / `value | null` (openDota, stratz) contracts for every other failure.

## Task Commits

Each task was committed atomically:

1. **Task 1: queues.ts + queues.test.ts, install deps** - `c9e2b5f` (feat)
2. **Task 2: logThrottle() + extend cached() with queue/pRetry/stale/backoff** - `251ea05` (feat)
3. **Task 3: wire services to queues + 429 Retry-After plumbing** - `bcb38d6` (feat)

_Note: TDD tasks 1 & 2 — the config/extension modules were GREEN on first run since the exports/behavior were authored alongside their tests; no unexpected RED pass occurred._

## Files Created/Modified
- `server/src/queues.ts` - Three per-upstream PQueue instances (valveQueue, openDotaQueue, stratzQueue).
- `server/src/queues.test.ts` - Asserts distinct instances + FIFO/interval ordering under fake timers.
- `server/src/services/retryAfter.ts` - Shared `parseRetryAfter()` (integer seconds or HTTP-date → ms).
- `server/src/cache.ts` - TTL.STALE; `isRateLimited`/`sleep`; 4th opts arg; pRetry wrapping (queue-aware); stale write + stale-on-exhaustion read.
- `server/src/cache.test.ts` - STRATZ_TOKEN in env mock; logger module mock; 2b retry/no-retry, 2c status-only throttle, 2d stale/rethrow tests.
- `server/src/logger.ts` - `logThrottle()` status-only structured helper.
- `server/src/services/valveApi.ts` - valveQueue on 2 call-sites; 429 → retryable throw.
- `server/src/services/openDotaApi.ts` - openDotaQueue on 3 call-sites; `throwIfRateLimited` + catch rethrow of 429.
- `server/src/services/stratzApi.ts` - stratzQueue on 2 call-sites; 429 → retryable throw.
- `server/package.json` - Added p-queue, p-retry.

## Decisions Made
- **Shared `parseRetryAfter` helper** (`services/retryAfter.ts`) rather than three copies — the plan explicitly left the shared-vs-local choice to executor discretion; a single tiny local util keeps the parse logic DRY and testable without a cross-cutting module.
- **openDota catch-block rethrow of 429** — openDota's `fetchXxx` bodies wrap parsing in try/catch that swallows to null. A raw 429 throw inside would be swallowed, so each catch now rethrows `status===429` before falling back to null, preserving the `value | null` graceful-degradation contract for all genuine (non-429) errors.
- **TTL.STALE = 24h** — conservative, owner-tunable, matching the plan's A2/Open-Q1 guidance.

## Deviations from Plan

None - plan executed exactly as written. The one point of executor discretion (parseRetryAfter placement) was explicitly delegated by the plan; resolved as a shared `services/retryAfter.ts` helper.

## Issues Encountered
- Full `vitest run` prints unrelated stderr noise from `live.roshan.test.ts` and `stratzApi.test.ts` (pre-existing `redis.rpush/lrange is not a function` mock gaps and expected `[cache] GET error` mock lines). These are pre-existing in those suites, out of scope for this plan, and all 110 tests still pass green. Not fixed (scope boundary).

## User Setup Required
None - no external service configuration required. p-queue and p-retry are pure-ESM and installed via npm.

## Next Phase Readiness
- ROADMAP criterion 2 (rate limits + backoff + structured throttle logs) is met.
- Remaining phase-11 plans (CORS, error boundaries, deploy config) are independent of this plan; the client-side error-boundary work (plan 11-02) has already landed on this branch.
- `npm test` (110 passing) and `npm run build` (tsc, clean) both green — safe to merge.

## Self-Check: PASSED

- Created files verified present: `server/src/queues.ts`, `server/src/queues.test.ts`, `server/src/services/retryAfter.ts`.
- Commits verified in git log: `c9e2b5f`, `251ea05`, `bcb38d6`.
- `npx tsc --noEmit` exit 0; `npx vitest run` 110/110 passing; `npm run build` exit 0.
- Security grep audit: no url/key/token in any logThrottle/429 line.

---
*Phase: 11-harden-deploy*
*Completed: 2026-07-07*
