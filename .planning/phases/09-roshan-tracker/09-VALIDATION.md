---
phase: 9
slug: roshan-tracker
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-03
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Detailed rationale lives in `09-RESEARCH.md` §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x (server + client + shared) |
| **Config file** | `server/vitest.config.ts`, `client/vitest.config.ts` |
| **Quick run command** | `pnpm -F server test -- --run roshan && pnpm -F client test -- --run RoshanBlock` |
| **Full suite command** | `pnpm -F server test -- --run && pnpm -F client test -- --run` |
| **Estimated runtime** | ~30 seconds (quick) / ~2 minutes (full) |

---

## Sampling Rate

- **After every task commit:** Run quick command (scoped to roshan files)
- **After every plan wave:** Run full suite
- **Before `/gsd-verify-work`:** Full suite green; manual UAT walkthrough on a live match
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Plan-level task IDs are TBD until planner runs. The map below documents the *behavioral coverage targets* the planner must wire to concrete tasks. Update with task IDs after planning.

| Behavioral Coverage | Plan (expected) | Requirement | Test Type | Automated Command | Status |
|---------------------|-----------------|-------------|-----------|-------------------|--------|
| Transition detector: prev=0, cur>0 → count++ | roshanState | ROSH-01 | unit | `pnpm -F server test roshanState` | ⬜ pending |
| Transition detector: prev=0, cur=0 → no-op | roshanState | ROSH-01 | unit | `pnpm -F server test roshanState` | ⬜ pending |
| Transition detector: prev>0, cur>0 (still dead) → no-op | roshanState | ROSH-01 | unit | `pnpm -F server test roshanState` | ⬜ pending |
| Transition detector: prev>0, cur=0 (just respawned) → no-op | roshanState | ROSH-01 | unit | `pnpm -F server test roshanState` | ⬜ pending |
| Bootstrap: no prior state + timer>0 → count=1 | roshanState | ROSH-01 | unit | `pnpm -F server test roshanState` | ⬜ pending |
| Bootstrap: no prior state + timer=0 → count=0 | roshanState | ROSH-01 | unit | `pnpm -F server test roshanState` | ⬜ pending |
| Loot table lookup: 1 → [Aegis] | roshanLoot | ROSH-02 | unit | `pnpm -F shared test roshanLoot` | ⬜ pending |
| Loot table lookup: 2 → [Aegis, Banner] | roshanLoot | ROSH-02 | unit | `pnpm -F shared test roshanLoot` | ⬜ pending |
| Loot table lookup: 3 → [Aegis, Banner, Cheese, RefresherShard] | roshanLoot | ROSH-02 | unit | `pnpm -F shared test roshanLoot` | ⬜ pending |
| Loot table lookup: 5 → same as 3 (clamped to 3+) | roshanLoot | ROSH-02 | unit | `pnpm -F shared test roshanLoot` | ⬜ pending |
| Item IDs in roshanLoot exist in items.json | roshanLoot | ROSH-02 | unit | `pnpm -F shared test roshanLoot` | ⬜ pending |
| Match-detail response includes `match.roshan` shape | live route | ROSH-01..03 | integration | `pnpm -F server test live.roshan` | ⬜ pending |
| Schema: `roshan_respawn_timer` accepts number, optional | valve schema | ROSH-03 | unit | `pnpm -F server test schemas` | ⬜ pending |
| RoshanBlock renders alive state (header + icons) | RoshanBlock | ROSH-02 | component | `pnpm -F client test RoshanBlock` | ⬜ pending |
| RoshanBlock renders dead state (mm:ss countdown) | RoshanBlock | ROSH-03 | component | `pnpm -F client test RoshanBlock` | ⬜ pending |
| RoshanBlock countdown ticks every 1s | RoshanBlock | ROSH-03 | component | `pnpm -F client test RoshanBlock` | ⬜ pending |
| RoshanBlock LAST DROP row appears once killCount>=1 | RoshanBlock | ROSH-02 | component | `pnpm -F client test RoshanBlock` | ⬜ pending |
| Counter persists across simulated 30s polls | live route | ROSH-01 | integration | `pnpm -F server test live.roshan` | ⬜ pending |
| New match_id → fresh Redis key (no carryover) | roshanState | ROSH-04 | integration | `pnpm -F server test roshanState` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/src/services/roshanState.test.ts` — RED stubs for all transition + bootstrap cases
- [ ] `shared/roshanLoot.test.ts` — RED stubs for table lookup
- [ ] `server/src/routes/live.roshan.test.ts` — RED stubs for response shape + persistence
- [ ] `client/src/components/RoshanBlock.test.tsx` — RED stubs for render states + tick
- [ ] vitest already configured project-wide (no install needed)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Counter increments on a real Roshan kill | ROSH-01 | Requires a live match with active Roshan timer | Open live tournament match in app; watch Roshan pit on stream; confirm counter ticks 0→1 within ~60s of pit clear |
| Loot icons render correctly via OpenDota CDN | ROSH-02 | Visual / network — confirm Cloudflare serves all 4 PNGs | Hit `/match/{id}` for a live game with at least one Roshan kill; visually inspect icons in DevTools |
| Countdown drift over 11 minutes | ROSH-03 | Requires real elapsed time; resync after 30s poll | Open match with dead Roshan, leave tab focused; client tick should match server resync within ±2s |
| Layout preservation — no shift to existing right stack | (project memory) | Visual regression | Open match before/after deploy; right column visually identical except RoshanBlock inserted between Map and Cooldowns |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
</content>
</invoke>
