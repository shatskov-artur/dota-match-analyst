---
phase: "06"
plan: "07"
subsystem: client
tags: [win-probability, three-bar-panel, gap-closure, typescript]
dependency_graph:
  requires: ["06-06"]
  provides: ["three-bar-win-probability-panel"]
  affects: ["client/src/components/WinProbBar.tsx", "client/src/hooks/useWinProbability.ts", "client/src/pages/MatchPage.tsx"]
tech_stack:
  added: []
  patterns: ["three-bar panel with conditional Stratz row", "SingleBar internal helper component", "prefersReducedMotion guard", "?? 0.5 TypeScript safety for required number props"]
key_files:
  created: []
  modified:
    - client/src/hooks/useWinProbability.ts
    - client/src/components/WinProbBar.tsx
    - client/src/pages/MatchPage.tsx
decisions:
  - "Use ?? 0.5 defaults for gold/estimate props in MatchPage (TypeScript requires number, render gate prevents display)"
  - "mb-3 on last SingleBar accepted — creates 12px below last bar within py-4 outer padding"
  - "No RADIANT/DIRE team label row — source label (Stratz/Gold/Est.) replaces that slot"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-26T23:04:48Z"
  tasks_completed: 3
  files_changed: 3
---

# Phase 06 Plan 07: Three-Bar Win Probability Panel Summary

Three-bar WinProbPanel replacing single-bar WinProbBar — Gold and Est. sigmoid bars always visible after 5 minutes, Stratz bar conditional on non-null response.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update WinProbResponse interface | ce33262 | client/src/hooks/useWinProbability.ts |
| 2 | Redesign WinProbBar as three-bar panel | 1d49ad0 | client/src/components/WinProbBar.tsx |
| 3 | Update MatchPage prop passing | 483c750 | client/src/pages/MatchPage.tsx |

## What Was Built

**Task 1 — WinProbResponse interface update:**
- Replaced `radiantWinProb: number | null` with three fields: `stratz: number | null`, `gold: number`, `estimate: number`
- `gameState` and `duration` fields retained (used by `computeWinProbInterval` — unchanged)

**Task 2 — WinProbBar redesign:**
- Fully replaced single-bar component with three-bar panel
- New `WinProbBarProps`: `stratz: number | null`, `gold: number`, `estimate: number`, `gameDuration`, `gameState`
- `SingleBar` internal helper: label column (muted #888888), radiant % (green), gradient bar, dire % (red)
- Panel gate: `gameState !== 5 || (gameDuration ?? 0) <= 300` returns null — unchanged logic, updated to not gate on Stratz
- Stratz bar: `{stratz !== null && <SingleBar label="Stratz" ... />}` — hidden when Stratz null
- Gold and Est. bars always render when panel visible
- `prefersReducedMotion` guard retained for accessibility
- `radiantWinProb` prop removed entirely

**Task 3 — MatchPage update:**
- Replaced `radiantWinProb={winProb.data?.radiantWinProb ?? null}` with three props
- `stratz={winProb.data?.stratz ?? null}` — passes null when Stratz unavailable
- `gold={winProb.data?.gold ?? 0.5}` and `estimate={winProb.data?.estimate ?? 0.5}` — 0.5 default for TypeScript (render gate prevents display before data loads)
- TypeScript clean: `npx tsc --noEmit` exits 0

## Verification Results

- `npx tsc --noEmit` (client): 0 errors
- `grep "radiantWinProb" client/src/`: 0 matches across all client files
- `grep "stratz !== null"` WinProbBar.tsx: 1 match (conditional render guard)
- Main project vitest suite: 396 tests passing (failures are pre-existing worktree infrastructure issues — missing `node_modules` in other worktrees)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — Gold and Est. bars are wired to real sigmoid values from the BFF (Plan 06-06). Stratz bar wired to real Stratz live model value.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. Client-only UI changes consuming already-computed BFF values.

## Self-Check: PASSED

- `client/src/hooks/useWinProbability.ts` — modified, committed ce33262
- `client/src/components/WinProbBar.tsx` — modified, committed 1d49ad0
- `client/src/pages/MatchPage.tsx` — modified, committed 483c750
- No modifications to STATE.md or ROADMAP.md
