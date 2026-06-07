---
phase: 8
slug: ability-cooldowns-map
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-28
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend) / vitest or node:test (backend BFF) — match repo convention |
| **Config file** | existing repo config (to be confirmed during Wave 0) |
| **Quick run command** | `pnpm -w test --run` (or `npm test -- --run`) |
| **Full suite command** | `pnpm -w test --run && pnpm -w typecheck` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-XX-XX | TBD | TBD | SC-08-01..05 | — | N/A | unit/integration | `pnpm -w test --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Planner will fill this table during plan creation, mapping each task to one of the 5 success criteria from ROADMAP Phase 8.*

---

## Wave 0 Requirements

- [ ] Confirm test framework + config in monorepo (vitest assumed; verify before generating stubs)
- [ ] Create test fixture: realistic GetLiveLeagueGames JSON snippet with `position_x`/`position_y` and `ultimate_state`/`ultimate_cooldown` populated
- [ ] Stub test files for cooldown sorting, coordinate transform, ultimate-name resolver
- [ ] Generate `shared/heroUltimates.json` from dotaconstants `hero_abilities.json` (last non-`generic_hidden` ability per hero)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live minimap renders 10 hero portraits at correct screen positions during a real tournament match | SC-08-04 | Requires live tournament match in progress — only verifiable in production | Open match page during live game, confirm all 10 portraits visible on minimap, sides color-coded (Radiant green / Dire red), positions match in-game observer view |
| Cooldowns block hidden during draft | SC-08-05 | Requires match in draft state — narrow time window | Open match page during draft phase (game_state 4); confirm Cooldowns block + Map render placeholders or are hidden per UI-SPEC |
| Cooldown countdown decrements every 30s tick | SC-08-01, SC-08-02 | Requires live game with ultimate on cooldown | Watch a single hero's ultimate-cooldown countdown across 2 polling cycles; confirm value decreased by ~30s |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
