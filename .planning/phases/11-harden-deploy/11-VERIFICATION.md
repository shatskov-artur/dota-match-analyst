---
phase: 11-harden-deploy
verified: 2026-07-10T02:10:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 11: Harden & Deploy Verification Report

**Phase Goal:** The owner and a small group of friends can hit a public URL and use the tool for a full day of tournament viewing without crashes, quota exhaustion, or manual restarts.
**Verified:** 2026-07-10T02:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP Success Criterion) | Status | Evidence |
|---|---|---|---|
| 1 | Every route-level component is wrapped in an error boundary so one failing widget does not blank the match screen | ✓ VERIFIED | `client/src/App.tsx` wraps both `<HomePage>` and `<MatchPage>` routes in `<BentoErrorBoundary>`. `client/src/pages/MatchPage.tsx` wraps all 7 `.bento-card` children in `<BentoErrorBoundary resetKeys={[matchId]}>` (grep count: 7 `bento-card` divs, 7 `resetKeys={[matchId]}` occurrences). `BentoErrorBoundary.tsx` uses react-error-boundary v6 (`FallbackComponent`, `resetErrorBoundary`), fallback never renders `error`/stack (only logged via `onError` to console). 4/4 RTL tests pass covering fallback render, sibling isolation, Retry re-mount, and no-stack-in-DOM. |
| 2 | BFF applies a global rate-limit queue per upstream (Valve, OpenDota, Stratz) with exponential backoff on 429 responses and structured pino logs for every throttle event | ✓ VERIFIED | `server/src/queues.ts` exports 3 distinct `PQueue` instances (`valveQueue`, `openDotaQueue`, `stratzQueue`). `server/src/cache.ts`'s `cached()` runs `fn` through `opts.queue` when provided, wraps it in `pRetry` with `shouldRetry: isRateLimited` (429-only), exponential backoff (`factor:2, minTimeout:1000, maxTimeout:30_000`), and calls `logThrottle()` on every failed attempt with `{upstream, attempt, retriesLeft, status, delayMs}` — no `url`/`key`/`token` field. `server/src/logger.ts`'s `logThrottle()` field type structurally excludes secret fields. All 3 services (`valveApi.ts`, `openDotaApi.ts`, `stratzApi.ts`) pass their queue + upstream label into every `cached()` call-site and throw a retryable `{status:429, retryAfterMs}` error on 429 via shared `parseRetryAfter()` helper, while preserving existing throw/null contracts for non-429 errors. On retry exhaustion, `cached()` reads `stale:<key>` and serves it if present, else rethrows (→ route 503). Both `queues.test.ts` and `cache.test.ts` assert this behavior with fake timers; server suite 114/114 green. |
| 3 | Polling stops automatically (`refetchInterval === false`) once `game_state === 6` so finished matches stop draining upstream quotas | ✓ VERIFIED | All 4 match-page pollers verified: `computeMatchInterval` (useMatchDetail.ts) returns `false` at `gameState===6`; `computeDraftInterval` (useDraftDetail.ts) and `computeIntelInterval` (useMatchIntel.ts) return `false` for any state other than `===2` (covers `===6`); `computeWinProbInterval` (useWinProbability.ts) checks `gameState===6` as its FIRST guard, returning `false`. Each has an explicit unit test: `useMatchDetail.test.ts` asserts `computeMatchInterval(6)===false`; `useDraftDetail.test.ts:26` asserts `computeDraftInterval(6)===false`; `useMatchIntel.test.ts:24` asserts `computeIntelInterval(6)===false`; `useWinProbability.test.ts:12` asserts `computeWinProbInterval(6,600)===false`. |
| 4 | Frontend is deployed to Vercel and BFF is deployed to Railway with Upstash Redis configured, and a shareable URL loads the live matches list without local setup | ✓ VERIFIED | Live deployment confirmed by orchestrator (treated as given evidence): BFF at `https://dota-match-analyst-production.up.railway.app` returns 200 healthy; SPA at `https://dota-match-analyst.vercel.app` returns 200 with correct title; deep-link `/match/:id` returns 200 (SPA rewrite works); `VITE_API_URL` inlined into bundle; CORS returns exact Vercel origin (never `*`); `GET /api/live/games` returns 200 with 21 live matches (Valve API + Upstash Redis working end-to-end). Config verified in codebase: `railway.json` (NIXPACKS, healthcheck `/api/health`) + `vercel.json` (SPA rewrite to `/index.html`) both at repo root and valid JSON; `client/src/lib/apiBase.ts` exports `API_BASE` from `VITE_API_URL` with `''` dev fallback; all 6 client hooks use `${API_BASE}/api/...` (no bare `fetch('/api` remains); `server/src/env.ts` has optional `CORS_ORIGIN` with trailing-slash normalization; `server/src/index.ts` CORS is env-driven, scoped to `/api/*`, `credentials` never set to `true`; production `start` script drops `--env-file` (reads Railway-injected `process.env`); `DEPLOY.md` (132 lines) documents the full Upstash→Railway→Vercel→cross-wire-CORS→smoke-test flow. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `server/src/queues.ts` | 3 named PQueue instances | ✓ VERIFIED | Exports `valveQueue`, `openDotaQueue`, `stratzQueue`, distinct instances, test-asserted |
| `server/src/cache.ts` | `cached()` extended with queue+pRetry+stale+backoff | ✓ VERIFIED | `stale:` appears 4x (write + 2 reads + comment); `shouldRetry`/`429` present; wired to `logThrottle` |
| `server/src/logger.ts` | `logThrottle()` structured throttle helper | ✓ VERIFIED | Exported, status-only field type (no url/key/token in type signature) |
| `server/src/services/valveApi.ts` | passes `valveQueue` to `cached()` | ✓ VERIFIED | Both call-sites (`getLiveLeagueGames`, `getLiveLeagueGamesFast`) pass `{queue: valveQueue, upstream: 'valve'}`; 429 throws retryable error |
| `server/src/services/openDotaApi.ts` | passes `openDotaQueue` to `cached()` | ✓ VERIFIED | All 3 call-sites pass `{queue: openDotaQueue, upstream: 'opendota'}`; `throwIfRateLimited` helper + catch rethrow preserves 429 propagation while keeping `value\|null` contract for other errors |
| `server/src/services/stratzApi.ts` | passes `stratzQueue` to `cached()` | ✓ VERIFIED | Both call-sites pass `{queue: stratzQueue, upstream: 'stratz'}`; 429 throws retryable error |
| `client/src/components/BentoErrorBoundary.tsx` | Reusable per-card error boundary | ✓ VERIFIED | `.bento-card` fallback, `Retry` button, `FallbackComponent`, `error` never interpolated into JSX |
| `client/src/components/BentoErrorBoundary.test.tsx` | RTL tests: fallback, isolation, retry | ✓ VERIFIED | 4 tests, all substantive (not stubs), 87 lines |
| `client/src/hooks/useMatchDetail.ts` | `computeMatchInterval` pure helper | ✓ VERIFIED | Exported, used as `refetchInterval: computeMatchInterval(...)` |
| `client/src/hooks/useMatchDetail.test.ts` | Unit test `computeMatchInterval(6)===false` | ✓ VERIFIED | 3 assertions (6→false, 5→30000, undefined→30000) |
| `client/src/lib/apiBase.ts` | `API_BASE` from `VITE_API_URL` | ✓ VERIFIED | `export const API_BASE = import.meta.env.VITE_API_URL ?? ''` |
| `railway.json` | Railway Nixpacks build/deploy config | ✓ VERIFIED (at repo root, not `client/`) | `NIXPACKS`, healthcheck `/api/health` — see Deviations note below |
| `vercel.json` | Vite SPA rewrite | ✓ VERIFIED (at repo root, not `client/vercel.json`) | Rewrite `/(.*) → /index.html` present — see Deviations note below |
| `DEPLOY.md` | Step-by-step deploy guide | ✓ VERIFIED | 148 lines, documents Upstash/Railway/Vercel/cross-wire-CORS/smoke-test flow |
| `.env.production.example` | Production env template | ✓ VERIFIED | Contains `VITE_API_URL` and `CORS_ORIGIN` |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `valveApi.ts` | `queues.ts` | `cached()` 4th-arg `{queue: valveQueue}` | ✓ WIRED | Both call-sites confirmed |
| `openDotaApi.ts` | `queues.ts` | `cached()` 4th-arg `{queue: openDotaQueue}` | ✓ WIRED | All 3 call-sites confirmed |
| `stratzApi.ts` | `queues.ts` | `cached()` 4th-arg `{queue: stratzQueue}` | ✓ WIRED | Both call-sites confirmed |
| `cache.ts` | `logger.ts` | `logThrottle()` call in `onFailedAttempt` | ✓ WIRED | Confirmed, test-asserted no url/key/token |
| `cache.ts` | Redis `stale:<key>` | write on success, read on exhaustion | ✓ WIRED | Both paths present and test-asserted |
| `MatchPage.tsx` | `BentoErrorBoundary.tsx` | each bento-card child wrapped, `resetKeys={[matchId]}` | ✓ WIRED | 7/7 cards wrapped |
| `App.tsx` | `BentoErrorBoundary.tsx` | each route element wrapped | ✓ WIRED | Both routes wrapped |
| `useMatchDetail.ts` | `useQuery refetchInterval` | `computeMatchInterval(matchFromCache?.game_state)` | ✓ WIRED | Confirmed |
| `useWinProbability.ts` (+5 other hooks) | `apiBase.ts` | `fetch(`${API_BASE}/api/...`)` | ✓ WIRED | All 6 hooks confirmed, zero bare `/api` fetches remain |
| `index.ts` | `env.ts CORS_ORIGIN` | `cors({origin: env.CORS_ORIGIN ?? 'http://localhost:5173'})` scoped `/api/*` | ✓ WIRED | Confirmed, `credentials` never `true` |

### Behavioral Spot-Checks

Live deployment behavior was already verified end-to-end by the orchestrator (network calls not re-run per instructions):
- `GET /api/health` → 200 `{"status":"ok"}` (Railway)
- SPA loads with correct title, deep-link SPA rewrite works (Vercel)
- CORS preflight returns exact Vercel origin, never `*`
- `GET /api/live/games` returns 200 with 21 live matches (Valve + Upstash Redis working end-to-end)

Local verification (this session):
- `cd server && npm test -- --run` → 114/114 passing
- `cd client && npm test -- --run` → 123/123 passing
- `cd server && npx tsc --noEmit` → exit 0
- `cd client && npm run build` → exit 0 (tsc + vite, 440 modules)
- `node -e "JSON.parse(railway.json); JSON.parse(vercel.json)"` → both valid JSON
- CORS `credentials` grep audit: never set to `true` in `index.ts`

### Requirements Coverage

No REQ-IDs map to Phase 11 (confirmed hardening phase — `.planning/REQUIREMENTS.md` has zero "Phase 11" references, and all 4 plans declare `requirements: []` with acceptance bar set to the corresponding ROADMAP success criterion instead). No orphaned requirements found.

### Anti-Patterns Found

None. Grep audit across all phase-11-modified files (`queues.ts`, `cache.ts`, `logger.ts`, all 3 service files, `retryAfter.ts`, `BentoErrorBoundary.tsx`, `App.tsx`, `MatchPage.tsx`, `useMatchDetail.ts`, `useDraftDetail.ts`, `useMatchIntel.ts`, `useWinProbability.ts`, `apiBase.ts`, `env.ts`, `index.ts`) found zero `TODO`/`FIXME`/`XXX`/`HACK`/`PLACEHOLDER` matches. No stub returns, no empty handlers, no hardcoded empty-data anti-patterns.

**Minor documentation inconsistency (non-blocking):** `DEPLOY.md`'s troubleshooting table (lines 138-139) still references the superseded `client/vercel.json` path and per-service `Root Directory = server/`/`client/` guidance, which contradicts the corrected main-body instructions (lines 45, 83: "Leave Root Directory as the repo root"). This is leftover text from before four `fix(11-04)` commits corrected the actual working deploy topology (root-directory builds so `tsc`/Vite can resolve `../shared`). Does not affect functionality — the live deployment (verified by the orchestrator) works using the corrected root-directory approach. Recommend a docs-only follow-up to align the troubleshooting table with the main body, but this does not block phase completion.

## Deviations from Plan (accepted, not gaps)

The 11-04-PLAN.md specified `client/vercel.json` and a `railway.json` whose `buildCommand`/`startCommand` called `npm run build`/`npm run start` directly inside `server/` with Root Directory set to `server/`/`client/` respectively. Git history (`fix(11-04)` commits `79369d3`, `a7e0e5a`, `f1c5199`, `32aee48`, all dated after the `feat(11-04)` commits) shows this was corrected during execution: because `server/tsconfig.json` uses `rootDir: ".."` to compile `../shared/*.ts` alongside `server/src`, and `client/` imports `@shared/*` + `../../../shared/*.json`, rooting either service's build at its own subdirectory breaks the `shared/` import. The actual (and currently live, orchestrator-verified) topology instead:
- Keeps Railway/Vercel Root Directory at the **repo root**
- `railway.json` (repo root) targets `server/` via `npm run build:server` / `npm run start:server` (root `package.json` wrapper scripts that `--prefix server`)
- `vercel.json` (repo root, not `client/vercel.json`) targets `client/` via `buildCommand: npm run build:client`, `outputDirectory: client/dist`
- Server `dist` output lands at `dist/server/src/index.js` (not `dist/index.js`) because of the `rootDir: ".."` tsconfig setting; `server/package.json`'s `start`/`start:local` scripts were updated to match

This is a superior, verified-working implementation of the same intent (D-08 Railway Nixpacks, D-09 split-origin deploy, SPA rewrite) — the underlying `shared/` monorepo constraint discovered during real deployment necessitated the root-directory approach. Since the live deployment is confirmed working end-to-end (BFF healthy, SPA loads, CORS correct, live data flowing), this is accepted as a valid deviation rather than a gap. No override needed since all functional truths and artifacts still verify — the artifact *content* (NIXPACKS builder, `/api/health` healthcheck, SPA rewrite to `/index.html`) matches the must-haves; only the file *location* and command *plumbing* differ from the plan's literal text.

### Human Verification Required

None. All four ROADMAP success criteria are verified either by direct code inspection + passing automated tests, or by the orchestrator's already-completed live-deployment network checks (treated as given evidence per task instructions).

### Gaps Summary

No gaps found. All 4 ROADMAP success criteria for Phase 11 are met:
1. Error boundaries — every MatchPage bento-card (7/7) and both routes wrapped, tests substantive.
2. Rate-limit queues + 429 backoff + structured logging — all 3 upstream services wired through per-upstream queues inside `cached()`, with stale-fallback and status-only throttle logs, fully test-covered.
3. Polling-stop at `game_state===6` — all 4 pollers verified with explicit unit tests.
4. Split-origin deploy — live and working (Vercel SPA + Railway BFF + Upstash Redis), config-as-code committed and valid, DEPLOY.md accurate in its main body (minor troubleshooting-table doc drift noted above, non-blocking).

Test suites are green (server 114/114, client 123/123), `tsc --noEmit` clean, client build clean — matching the orchestrator's pre-verification numbers exactly.

---

*Verified: 2026-07-10T02:10:00Z*
*Verifier: Claude (gsd-verifier)*
