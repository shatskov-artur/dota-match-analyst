---
phase: 5
slug: hero-player-intel
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-25
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^2.0.0 |
| **Config file** | none — Vitest discovers tests via `vite.config.ts` (client) and `vitest` script (server) |
| **Quick run command** | `cd client && npm test -- --run` |
| **Full suite command** | `cd client && npm test -- --run && cd ../server && npm test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd client && npm test -- --run`
- **After every plan wave:** Run `cd client && npm test -- --run && cd ../server && npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 5-W0-01 | 01 | 0 | DRAFT-03 | — | N/A | unit | `cd client && npm test -- --run src/utils/winrateColor.test.ts` | ❌ Wave 0 | ⬜ pending |
| 5-W0-02 | 01 | 0 | DRAFT-03 | — | N/A | unit | `cd server && npm test -- --run src/services/openDotaApi.test.ts` | ❌ Wave 0 | ⬜ pending |
| 5-W0-03 | 01 | 0 | DRAFT-04 | T-5-01 | rankCounters guards division-by-zero | unit | `cd server && npm test -- --run src/services/intel.test.ts` | ❌ Wave 0 | ⬜ pending |
| 5-W0-04 | 01 | 0 | DRAFT-04 | — | applyKnownToPlay threshold enforced server-side | unit | `cd server && npm test -- --run src/services/intel.test.ts` | ❌ Wave 0 | ⬜ pending |
| 5-W0-05 | 01 | 0 | PLAYER-01 | — | N/A | unit | `cd client && npm test -- --run src/hooks/useMatchIntel.test.ts` | ❌ Wave 0 | ⬜ pending |
| 5-W0-06 | 01 | 0 | PLAYER-02 | T-5-02 | hidden profile skips OpenDota call entirely | unit | `cd server && npm test -- --run src/services/intel.test.ts` | ❌ Wave 0 | ⬜ pending |
| 5-W1-01 | 02 | 1 | DRAFT-03 | T-5-03 | matchId validated via Number.isFinite() before use | unit | `cd server && npm test -- --run src/services/openDotaApi.test.ts` | ❌ Wave 0 | ⬜ pending |
| 5-W2-01 | 03 | 2 | DRAFT-03 | — | N/A | manual | Open match page, verify badge strips on pick portraits only | N/A | ⬜ pending |
| 5-W2-02 | 03 | 2 | DRAFT-04 | — | N/A | manual | Hover pick portrait, verify tooltip card appears with counters | N/A | ⬜ pending |
| 5-W2-03 | 03 | 2 | PLAYER-02 | — | N/A | manual | Verify hidden-profile row shows `— games · —%`, no crash | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `client/src/utils/winrateColor.test.ts` — stubs for DRAFT-03 badge color logic (>0.52 green, <0.48 red, neutral)
- [ ] `server/src/services/openDotaApi.test.ts` — extend with heroStats transform (zero-pick guard, id vs hero_id field)
- [ ] `server/src/services/intel.test.ts` — stubs for `rankCounters()`, `applyKnownToPlay()`, hidden-profile skip (PLAYER-02)
- [ ] `client/src/hooks/useMatchIntel.test.ts` — stubs for `computeIntelInterval()` (game_state=2 → 5000, otherwise false)

Existing infrastructure: Vitest installed. `hiddenProfile` tests from Phase 1 cover the base guard — verify still green (no new stubs needed for that).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Badge strip appears on pick portraits only, not bans or empty slots | DRAFT-03 | Visual rendering — no automated assert for CSS overlay visibility | Open a live match in draft phase; confirm badges on picks, absent on bans/empty |
| Tooltip card positions above portrait by default; flips below near viewport top | DRAFT-04 | Viewport geometry — requires browser rendering context | Scroll a pick portrait near top of viewport; confirm tooltip flips below |
| Tooltip shows `— games · —%` for hidden-profile player, no error | PLAYER-02 | Requires a real match with a hidden-profile player | Identify a match with account_id=4294967295 player; hover their pick portrait |
| Tooltip closes immediately on mouse-leave | DRAFT-04 | Interaction timing — no reliable automated test without browser automation | Mouse off portrait; confirm tooltip unmounts immediately |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
