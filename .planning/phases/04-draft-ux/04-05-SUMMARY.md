---
phase: 04-draft-ux
plan: 05
subsystem: draft-ux
tags: [gap-closure, components, layout, animation]
dependency_graph:
  requires: [04-04]
  provides: [vertical-draft-layout, ordinal-badges, active-slot-pulse, phase-sublabel]
  affects: [DraftSection, DraftColumn, DraftPortrait, DraftTurnIndicator]
tech_stack:
  added: []
  patterns: [animate-pulse, ember-glow, flex-col-layout, ordinal-badge-overlay]
key_files:
  created: []
  modified:
    - client/src/components/DraftSection.tsx
    - client/src/components/DraftColumn.tsx
    - client/src/components/DraftPortrait.tsx
    - client/src/components/DraftTurnIndicator.tsx
decisions:
  - "Ordinal badge aria-hidden=true — position in picks/bans row conveys semantic meaning"
  - "animate-pulse applied to empty slot container (not a wrapper) so opacity cycle pulses the border"
  - "currentStep passed as number (never undefined) — computed from array lengths which are always numbers"
  - "getPhaseName not exported — internal helper only, no external consumers"
metrics:
  duration: "155s"
  completed: "2026-04-24"
  tasks_completed: 5
  tasks_total: 5
  files_modified: 4
---

# Phase 04 Plan 05: Gap-05 Draft UX Closure Summary

**One-liner:** Vertical Radiant-top/Dire-bottom draft layout with per-slot P1-P5/B1-B7 ordinal badges, animate-pulse ember border on next-to-fill slot, and CM 7.40 phase sub-label in DraftTurnIndicator.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Flip DraftSection to vertical layout + compute activeSlotIndex/currentStep | 35f3125 | DraftSection.tsx |
| 2 | Add activePickIndex/activeBanIndex props to DraftColumn, forward to DraftPortrait | 0e6a8c8 | DraftColumn.tsx |
| 3 | Add isActive pulse + ordinal badge to DraftPortrait | bfdd904 | DraftPortrait.tsx |
| 4 | Add currentStep prop and getPhaseName sub-label to DraftTurnIndicator | 2086251 | DraftTurnIndicator.tsx |
| 5 | Full verification — TypeScript, tests, build | — | (verification only) |

## What Was Built

**DraftSection (Task 1):**
- Replaced `flex items-start gap-6` with `flex flex-col gap-3` — Radiant renders on top, Dire below
- Computes `currentStep` (total completed draft actions, 0–24) passed to DraftTurnIndicator
- Computes `radiantActivePickIndex`, `radiantActiveBanIndex`, `direActivePickIndex`, `direActiveBanIndex` — each is the `picks.length` / `bans.length` of the active team when it is their turn, -1 otherwise
- Extracts `isDraft = gameState === 2` local to avoid repeating the check four times

**DraftColumn (Task 2):**
- Added `activePickIndex?: number` and `activeBanIndex?: number` optional props (default -1)
- Removed `flex-1` class (not needed in vertical stack — rows take natural width)
- Each pick portrait now receives `isActive={i === activePickIndex}` and `ordinal={\`P${i+1}\`}`
- Each ban portrait now receives `isActive={i === activeBanIndex}` and `ordinal={\`B${i+1}\`}`

**DraftPortrait (Task 3):**
- Added `isActive?: boolean` (default false) — empty slot gets `animate-pulse` class + `#b03030` border
- Added `ordinal?: string` — filled slot renders 9px badge in top-left corner (P1–P5 for picks, B1–B7 for bans)
- Ordinal badge uses `aria-hidden="true"` (decorative; row position in DraftColumn conveys semantic meaning)
- `animate-pulse` uses Tailwind's built-in opacity cycle on the bordered div — no custom @keyframes added to index.css

**DraftTurnIndicator (Task 4):**
- Added `currentStep?: number` prop (default 0)
- Added internal `getPhaseName(step)` helper mapping CM 7.40 step count to phase name strings
- Each render path wrapped in `<div>` to stack main label + phase sub-label
- Phase sub-label uses `#555` color and `tracking-[0.2em]` for visual hierarchy below main line
- `opacity` and `transition` moved to outer `<div>` so both lines fade together in tentative state

## Verification Results

- `tsc --noEmit`: exit 0 (no type errors)
- `vitest run`: 46/46 tests pass (6 test files, no regressions)
- `vite build`: exit 0 (pre-existing CSS @import warning — acceptable, not a failure)

## Deviations from Plan

None — plan executed exactly as written. The TypeScript errors after Task 1 alone were expected (DraftColumn and DraftTurnIndicator not yet updated); all four components were written before the first combined `tsc` check, which passed immediately.

## Known Stubs

None — all props are wired through from live data in `useDraftDetail`. The `isActive` pulse and ordinal badge require no additional data sources.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. All changes are pure presentational component reshaping with computed props from already-validated BFF data.

## Pending

**Task 6 (checkpoint:human-verify):** Human browser verification of vertical layout, ordinal badges, active-slot pulse, and phase sub-label. Awaiting orchestrator.

## Self-Check: PASSED

- `client/src/components/DraftSection.tsx` — exists, contains `flex flex-col`, `currentStep`, `activePickIndex`
- `client/src/components/DraftColumn.tsx` — exists, contains `activePickIndex`, `activeBanIndex`, `isActive={i === activePickIndex}`, `ordinal`
- `client/src/components/DraftPortrait.tsx` — exists, contains `isActive`, `ordinal`, `animate-pulse`
- `client/src/components/DraftTurnIndicator.tsx` — exists, contains `getPhaseName`, `currentStep`, phase sub-label `<p>`
- Commits 35f3125, 0e6a8c8, bfdd904, 2086251 — all confirmed in git log
