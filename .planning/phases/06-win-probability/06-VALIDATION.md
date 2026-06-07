---
phase: 6
slug: win-probability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x |
| **Config file** | none — vitest configured via vite.config.ts (client), package.json scripts (server) |
| **Quick run command (server)** | `cd server && npx vitest run src/services/stratzApi.test.ts` |
| **Quick run command (client)** | `cd client && npx vitest run src/hooks/useWinProbability.test.ts` |
| **Full suite command (server)** | `cd server && npx vitest run` |
| **Full suite command (client)** | `cd client && npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run for the relevant test file (server or client)
- **After every plan wave:** Run `cd server && npx vitest run` + `cd client && npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 0 | MATCH-06 | — | N/A | unit | `cd client && npx vitest run src/hooks/useWinProbability.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 0 | MATCH-06 | T-6-01 | Stratz null does not crash aggregator | unit | `cd server && npx vitest run src/services/stratzApi.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | MATCH-06 | T-6-01 | STRATZ_TOKEN required at startup | unit | `cd server && npx vitest run` | ✅ | ⬜ pending |
| 06-02-02 | 02 | 1 | MATCH-06 | T-6-02 | Cache key is matchId-only (not per-user) | unit | `cd server && npx vitest run src/services/stratzApi.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 1 | MATCH-06 | — | rankCountersStratz top-3 sorted ascending | unit | `cd server && npx vitest run src/services/intel.test.ts` | ✅ (extend) | ⬜ pending |
| 06-04-01 | 04 | 2 | MATCH-06 | — | computeWinProbInterval: 30000 when state===5 && duration>300 | unit | `cd client && npx vitest run src/hooks/useWinProbability.test.ts` | ❌ W0 | ⬜ pending |
| 06-04-02 | 04 | 2 | MATCH-06 | — | computeWinProbInterval: false when state===6 (postgame stop) | unit | `cd client && npx vitest run src/hooks/useWinProbability.test.ts` | ❌ W0 | ⬜ pending |
| 06-05-01 | 05 | 2 | MATCH-06 | — | WinProbBar returns null when gameDuration <= 300 | unit | `cd client && npx vitest run` | ✅ | ⬜ pending |
| 06-06-01 | 06 | 3 | MATCH-06 | — | Bar renders at correct position below ScoreHeader | manual | Browser visual inspection | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `client/src/hooks/useWinProbability.test.ts` — stubs for `computeWinProbInterval` cadence contract (MATCH-06 gate logic: game_state===5 + duration>300 → 30000, game_state===6 → false, etc.)
- [ ] `server/src/services/stratzApi.test.ts` — covers null-return on fetch error, null-return on empty liveWinRateValues, null-return on 4xx/5xx. Uses same `vi.mock('ioredis')` + `vi.mock('../env.js')` pattern as `openDotaApi.test.ts`.

*Existing `intel.test.ts` should be extended to cover `rankCountersStratz` when implemented.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Win probability bar appears between ScoreHeader and DraftSection/HeroPlayerGrid after 5 min in-game | MATCH-06 | Requires live Stratz data and a real in-game match | Open a live match that is >5 min in-game; verify bar is visible with Radiant/Dire % labels |
| Bar disappears silently when Stratz is unreachable | MATCH-06 | Requires network simulation | Block `api.stratz.com` at OS level or set invalid STRATZ_TOKEN; verify bar is absent with no error message visible |
| Bar animation: width transition on probability change | MATCH-06 | CSS animation cannot be unit-tested | Watch bar over 2+ polling cycles; fill should slide smoothly (500ms ease) when probability changes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
