---
phase: 7
slug: in-game-item-intel
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-28
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `client/vite.config.ts` (client tests) / `server/vite.config.ts` (server tests) |
| **Quick run command** | `cd client && npx vitest run` |
| **Full suite command** | `cd server && npx vitest run && cd ../client && npx vitest run` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd client && npx vitest run`
- **After every plan wave:** Run `cd server && npx vitest run && cd ../client && npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 7-W0-01 | 01 | 0 | SC-02 | — | N/A | unit | `cd client && npx vitest run src/utils/itemMapper.test.ts` | ❌ W0 | ⬜ pending |
| 7-W0-02 | 01 | 0 | SC-03 | — | N/A | unit | `cd client && npx vitest run src/utils/formatNW.test.ts` | ❌ W0 | ⬜ pending |
| 7-W1-01 | 02 | 1 | SC-02 | — | unknown item ID → null (no crash) | unit | `cd client && npx vitest run src/utils/itemMapper.test.ts` | ❌ W0 | ⬜ pending |
| 7-W1-02 | 02 | 1 | SC-03 | — | N/A | unit | `cd client && npx vitest run src/utils/formatNW.test.ts` | ❌ W0 | ⬜ pending |
| 7-W2-01 | 03 | 2 | SC-01 | — | N/A | manual | Inspect ItemsBlock row order in browser | — | ⬜ pending |
| 7-W2-02 | 03 | 2 | SC-04 | — | id=0 → placeholder div, no img | manual | Inspect empty slots in browser | — | ⬜ pending |
| 7-W3-01 | 04 | 3 | SC-03 | — | Items update every 30s | manual | Watch network tab for 30s polling | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `client/src/utils/itemMapper.test.ts` — covers SC-02: itemMapper returns name for known ID, null for 0/unknown ID
- [ ] `client/src/utils/formatNW.test.ts` — covers SC-03: formatNW(12400)→"12.4k", formatNW(850)→"850", formatNW(undefined)→"—"
- [ ] `shared/items.json` — must exist before Wave 0 tests can run (itemMapper imports it)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 10 heroes sorted descending by net_worth | SC-01 | React sort output requires visual inspection during live match | Open a live in-game match; verify row #1 has highest NW, row #10 has lowest |
| Items update on 30s polling cycle | SC-03 | Polling cadence requires real-time network observation | Open Network tab; confirm `/api/live/draft/:matchId` fires every ~30s; verify item icons update |
| Empty slot for id=0 | SC-04 | Component renders placeholder div — requires visual confirmation | Inspect rows for heroes with empty item slots; confirm dark squares, no broken img tags |
| Neutral item slot field name (item_neutral) | D-04 VERIFY | Field name not confirmed in Valve API docs | During Wave 1, inspect a live match scoreboard payload; confirm `item_neutral` field name |
| Backpack slots (item6–item8) presence | D-04 VERIFY | Field availability in pro match live API unconfirmed | During Wave 1, inspect scoreboard payload; confirm whether item6/item7/item8 are present |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
