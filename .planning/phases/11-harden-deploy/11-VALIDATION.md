---
phase: 11
slug: harden-deploy
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-14
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x (server + client both declare `"test": "vitest"`) |
| **Config file** | none explicit — Vite/Vitest defaults; client uses jsdom (`@testing-library/react`, `jsdom` in devDeps) |
| **Quick run command** | server: `cd server && npx vitest run src/cache.test.ts` · client: `cd client && npx vitest run src/hooks` |
| **Full suite command** | `cd server && npm test -- --run` **and** `cd client && npm test -- --run` |
| **Estimated runtime** | ~15–30 seconds per package |

---

## Sampling Rate

- **After every task commit:** Run the matching quick-run command for the package/file touched
- **After every plan wave:** Run `npm test -- --run` in the affected package (server or client)
- **Before `/gsd-verify-work`:** Both suites green **+** a manual deploy smoke (shareable URL loads live list, deep-link refresh works)
- **Max feedback latency:** ~30 seconds (quick run); ~60 seconds (full suite, both packages)

---

## Per-Task Verification Map

> Criterion → observable signal → automated check. Task IDs are placeholders until the planner assigns them.

| Criterion | Wave | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-----------|------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1. Per-card error isolation — failing child renders `BentoFallback`, siblings still render | hardening | — | Fallback shows generic message; never renders stack trace | component (RTL) | `cd client && npx vitest run src/components/BentoErrorBoundary.test.tsx` | ❌ W0 | ⬜ pending |
| 1b. Retry re-mounts boundary children | hardening | — | N/A | component (RTL) | same file | ❌ W0 | ⬜ pending |
| 2a. Per-upstream queue throttles (own queue each: Valve/OpenDota/Stratz) | hardening | T-DoS | Quota-miss storm bounded by intervalCap | unit | `cd server && npx vitest run src/queues.test.ts` | ❌ W0 | ⬜ pending |
| 2b. 429 → exponential backoff; non-429 NOT retried | hardening | T-DoS | Backoff respects Retry-After | unit (fake timers) | `cd server && npx vitest run src/cache.test.ts` | ⚠️ extend | ⬜ pending |
| 2c. Structured throttle log shape `{upstream, attempt, retriesLeft, status, delayMs}` | hardening | T-InfoDisc | Log includes status only — no URL, no key/token | unit (logger spy) | `cd server && npx vitest run src/cache.test.ts` | ⚠️ extend | ⬜ pending |
| 2d. Exhaustion → stale `stale:<key>` if present, else 503 | hardening | T-DoS | Never blocks indefinitely | unit | `cd server && npx vitest run src/cache.test.ts` | ❌ W0 | ⬜ pending |
| 3. Polling stops at `game_state===6` (`computeDraftInterval`/`computeWinProbInterval`/`computeIntelInterval`===false; `useMatchDetail` refetchInterval:false) | hardening | T-DoS | Finished matches stop draining quota | unit (pure helpers) | `cd client && npx vitest run src/hooks` | ⚠️ assert ===6 | ⬜ pending |
| 4. Deploy / shareable URL — `railway.json`+`vercel.json` valid; `/api/health` 200; SPA deep link `/match/:id` → index.html | deploy | T-CORS, T-Tampering | CORS scoped to Vercel origin (no `*`+credentials); SPA rewrite serves static index only | manual + smoke | manual per DEPLOY.md; optional `index.test.ts` health route | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/src/queues.ts` + `server/src/queues.test.ts` — per-upstream p-queue config + throttle behavior (criterion 2a)
- [ ] Extend `server/src/cache.test.ts` — 429 retry/backoff, non-429 no-retry gating, throttle-log shape, stale-then-503 exhaustion (criterion 2b/2c/2d). Existing ioredis mock pattern (lines 4–25) is reusable
- [ ] `client/src/components/BentoErrorBoundary.tsx` + `BentoErrorBoundary.test.tsx` — fallback render + Retry reset + sibling isolation (criterion 1)
- [ ] Polling-stop tests — add/confirm explicit `game_state===6 → false` assertion in each pure interval helper test, and a `useMatchDetail` test asserting `refetchInterval` is false post-game (D-11)
- [ ] Framework install: **none** — Vitest already present in both packages

*Existing test files confirmed: `cache.test.ts`, `useWinProbability.test.ts`, `useDraftDetail.test.ts`, `useMatchIntel.test.ts`, `index.test.ts`.*

---

## Manual-Only Verifications

| Behavior | Criterion | Why Manual | Test Instructions |
|----------|-----------|------------|-------------------|
| Shareable URL loads live matches list without local setup | 4 | Requires deployed Vercel + Railway + Upstash (owner accounts, not in CI) | Follow DEPLOY.md; open prod Vercel URL in a fresh browser, confirm live list renders |
| SPA deep-link refresh works | 4 | Needs real Vercel SPA rewrite serving index.html | Navigate to `/match/:id`, hard-refresh; page loads (not 404) |
| Split-origin CORS allows Vercel → Railway | 4 | Cross-origin behavior only observable against deployed origins | Confirm no CORS error in browser console on prod; preflight returns allowed origin |
| Full-day soak (no crashes/quota exhaustion/manual restart) | phase goal | Time-based real tournament condition | Run during a real match day; observe logs for throttle events + no 503 storms |

---

## Validation Sign-Off

- [ ] All criteria have an `<automated>` verify or a Wave 0 dependency (deploy criterion is manual-by-nature)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (queues.ts/test, cache.test extensions, BentoErrorBoundary + test)
- [ ] No watch-mode flags (all commands use `run`/`--run`)
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter (after planner maps tasks)

**Approval:** pending
