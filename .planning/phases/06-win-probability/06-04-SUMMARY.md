---
phase: 06-win-probability
plan: "04"
subsystem: client
tags: [win-probability, stratz, react, tanstack-query, accessibility, tdd-green]
dependency_graph:
  requires:
    - plan 06-01 (RED tests in client/src/hooks/useWinProbability.test.ts)
    - plan 06-03 (BFF route /api/live/winprob/:matchId)
  provides:
    - client/src/hooks/useWinProbability.ts
    - client/src/components/WinProbBar.tsx
  affects:
    - Plan 06-05 (MatchPage will import WinProbBar and useWinProbability)
tech_stack:
  added: []
  patterns:
    - computeWinProbInterval pure helper exported for unit testing (Wave 0 pattern)
    - TanStack Query v5 refetchInterval callback reading q.state.data
    - Inline style colors (#4ade80/#ef4444) + Tailwind layout (same as ScoreHeader)
    - CSS gradient hard color stop for two-tone bar (no DOM split needed)
    - prefers-reduced-motion guard via window.matchMedia
key_files:
  created:
    - client/src/hooks/useWinProbability.ts
    - client/src/components/WinProbBar.tsx
  modified: []
decisions:
  - gameState===6 is first guard in computeWinProbInterval (CLAUDE.md critical pitfall: prevents draining Stratz 500 req/hr quota on finished matches)
  - WinProbBar uses single div with CSS gradient hard stop instead of two-div approach (simpler, equivalent result)
  - gameDuration prop name chosen (NOT gameTime — field does not exist in Valve payload)
  - useMemo removed from WinProbBar (window.matchMedia call is inline, not worth memoizing)
metrics:
  duration: "58s"
  completed_date: "2026-04-26"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 06 Plan 04: Client Hook + WinProbBar Component Summary

**One-liner:** useWinProbability TanStack Query hook with 30s cadence gate + WinProbBar gradient accessibility component, turning all 7 Wave 0 RED tests GREEN.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | useWinProbability hook (turns Wave 0 client test GREEN) | a2b629e | client/src/hooks/useWinProbability.ts |
| 2 | WinProbBar component | b40f0be | client/src/components/WinProbBar.tsx |

## Verification Results

- `npx vitest run src/hooks/useWinProbability.test.ts` — 7/7 GREEN
- `npx vitest run` (full client suite) — 65/65 GREEN
- `npx tsc --noEmit` — exits 0

## Deviations from Plan

**1. [Rule 2 - Cleanup] Removed unused `useMemo` import from WinProbBar**

- **Found during:** Task 2 implementation
- **Issue:** Plan action included `import { useMemo } from 'react'` but useMemo was never called — the `prefersReducedMotion` check is a simple inline expression, not a memoized value. Leaving the import would trigger a TypeScript/ESLint unused import warning.
- **Fix:** Omitted the useMemo import entirely. The window.matchMedia check works correctly inline.
- **Files modified:** client/src/components/WinProbBar.tsx

All other plan instructions executed exactly as written.

## Known Stubs

None — all production code is fully implemented and wired.

## Threat Flags

None — no new network endpoints or auth paths introduced. fetchWinProb calls BFF /api/live/winprob/:matchId (BFF route implemented in Plan 06-03).

## Self-Check: PASSED

- `client/src/hooks/useWinProbability.ts` — FOUND
- `client/src/components/WinProbBar.tsx` — FOUND
- Commit a2b629e — FOUND
- Commit b40f0be — FOUND
- 7/7 useWinProbability tests GREEN — CONFIRMED
- 65/65 full client suite GREEN — CONFIRMED
- TypeScript clean — CONFIRMED
