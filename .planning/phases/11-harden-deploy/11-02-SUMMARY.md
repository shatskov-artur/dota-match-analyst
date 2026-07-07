---
phase: 11-harden-deploy
plan: 02
subsystem: ui
tags: [react-error-boundary, error-boundary, resilience, react, vitest, rtl]

# Dependency graph
requires:
  - phase: 10.3-match-page-layout
    provides: MatchPage 3-row bento-card layout (heroes/items/cooldowns, map/roshan/buildings, history)
  - phase: 03-match-core
    provides: MatchPage route + useParams matchId, ScoreHeader/HeroPlayerGrid bento composition
provides:
  - Reusable BentoErrorBoundary (react-error-boundary v6) with bento-styled generic fallback + Retry
  - Per-bento-card render-crash isolation on MatchPage (7 cards, keyed by matchId)
  - Route-level error boundaries on both Home and Match as backstop
  - react-error-boundary bumped ^4 -> ^6 (v6.1.2, React-19-safe)
affects: [harden-deploy, deploy, future-match-page-widgets]

# Tech tracking
tech-stack:
  added: [react-error-boundary@^6 (was ^4)]
  patterns:
    - "Per-card error boundary keyed by resetKeys={[matchId]} so navigation auto-clears a stuck boundary"
    - "Fallback renders generic copy only — caught error/stack logged to console via onError, never interpolated into JSX (T-11-05)"

key-files:
  created:
    - client/src/components/BentoErrorBoundary.tsx
    - client/src/components/BentoErrorBoundary.test.tsx
  modified:
    - client/package.json
    - client/src/pages/MatchPage.tsx
    - client/src/App.tsx

key-decisions:
  - "Wrap card CHILDREN (not the outer .bento-card div) so the fallback inherits the card frame and layout classes stay untouched"
  - "BentoFallback does NOT destructure error — stack only reaches console via onError (SECURITY T-11-05)"
  - "HistoryGraphs left slot is not a .bento-card (renders its own card) so it is covered by the route-level backstop, not an inner per-card boundary"

patterns-established:
  - "BentoErrorBoundary: per-widget render-crash isolation with recoverable Retry, reusing the .bento-card surface so a failed widget looks intentional"

requirements-completed: []  # hardening plan — no direct REQ mapping; acceptance bar = ROADMAP criterion 1

# Metrics
duration: ~8min
completed: 2026-07-07
---

# Phase 11 Plan 02: Per-Bento-Card Error Boundaries Summary

**Reusable BentoErrorBoundary (react-error-boundary v6) isolates a single Match widget's render crash to a bento-styled "Couldn't load this panel." fallback with a Retry that re-mounts, wired around all 7 MatchPage cards (keyed by matchId) plus both routes as a backstop.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-07-07T22:32:16+02:00
- **Tasks:** 2
- **Files created:** 2
- **Files modified:** 3

## Accomplishments
- New `BentoErrorBoundary` component (react-error-boundary v6 API: `FallbackComponent` / `resetErrorBoundary` / `resetKeys` / `onError`) with a `.bento-card`-styled generic fallback and a Retry button using the MatchPage back-nav idiom.
- SECURITY (T-11-05): the fallback never renders the thrown error message or stack — it is logged to console only via `onError`. Asserted by Test 4.
- Every one of the 7 `.bento-card` children on MatchPage wrapped in `<BentoErrorBoundary resetKeys={[matchId]}>` so one crashing widget isolates to its card and siblings keep rendering (T-11-06); navigating to a new match auto-clears a stuck boundary.
- Both App routes (Home, Match) wrapped as a top-level backstop (D-07).
- `react-error-boundary` bumped `^4 -> ^6` (resolved 6.1.2), resolving the v4→v6 API drift pitfall.
- 4 new RTL tests (fallback render, sibling isolation, Retry re-mount, no-stack-in-UI) all GREEN; full client suite 123/123 GREEN; tsc + vite build green.

## Task Commits

Each task was committed atomically (TDD RED → GREEN for Task 1):

1. **Task 1 (RED): failing BentoErrorBoundary tests** - `c5ca988` (test)
2. **Task 1 (GREEN): BentoErrorBoundary + dep bump ^4→^6** - `250a88f` (feat)
3. **Task 2: wrap MatchPage cards + App routes** - `3303686` (feat)

_Note: no REFACTOR commit needed — GREEN implementation matched the plan spec and passed tsc cleanly._

## Files Created/Modified
- `client/src/components/BentoErrorBoundary.tsx` (created) - Reusable per-card error boundary; bento-styled generic fallback + Retry; stack logged via onError only.
- `client/src/components/BentoErrorBoundary.test.tsx` (created) - 4 RTL tests: fallback render, sibling isolation, Retry re-mount, no-stack-in-UI.
- `client/package.json` (modified) - `react-error-boundary` `^4.0.0` → `^6`.
- `client/src/pages/MatchPage.tsx` (modified) - 7 bento-card children wrapped in `<BentoErrorBoundary resetKeys={[matchId]}>`.
- `client/src/App.tsx` (modified) - both routes wrapped as route-level backstop.

## Decisions Made
- Wrapped card **children** (not the outer `.bento-card` div): the outer layout classes stay unchanged and the fallback inherits the card frame; a stuck boundary auto-clears when `matchId` changes.
- `BentoFallback` does not destructure `error` at all — the stack cannot reach the UI even accidentally (SECURITY T-11-05). The plan's action code already followed this (its inline representative snippet in PATTERNS.md destructured `error` but did not render it; I used the non-destructuring action variant).
- The HistoryGraphs left slot uses a plain wrapper `div` (HistoryGraphs renders its own card), so it is not one of the 7 `.bento-card` blocks and is covered by the route-level backstop rather than an inner boundary — matching the plan's enumeration of exactly 7 cards.

## Deviations from Plan

None - plan executed exactly as written. The plan's `<action>` block for Task 1 specified the non-`error`-destructuring `BentoFallback` variant (the security-correct form), which is what was implemented.

## Issues Encountered
None. RED confirmed via import failure; GREEN passed on first run; build and full suite green.

## Threat Flags

None — no new security surface introduced beyond the plan's threat_model. Both registered threats (T-11-05 information disclosure, T-11-06 client-side blanking) are mitigated and test-covered.

## Known Stubs

None — the fallback's generic copy is intentional (security requirement), and every boundary wraps a live, data-wired child.

## TDD Gate Compliance

- RED gate: `c5ca988` `test(11-02): add failing tests…` (suite RED via missing import).
- GREEN gate: `250a88f` `feat(11-02): add BentoErrorBoundary…` (4/4 tests pass).
- REFACTOR: none needed.

## Next Phase Readiness
- ROADMAP criterion 1 met: one failing widget no longer blanks the match screen; render crashes isolate to a recoverable per-card fallback with a route-level backstop.
- Ready for the remaining harden-deploy plans (deploy config / Vercel + Railway).

---
*Phase: 11-harden-deploy*
*Completed: 2026-07-07*

## Self-Check: PASSED

- FOUND: client/src/components/BentoErrorBoundary.tsx
- FOUND: client/src/components/BentoErrorBoundary.test.tsx
- FOUND: .planning/phases/11-harden-deploy/11-02-SUMMARY.md
- FOUND commit: c5ca988 (test RED)
- FOUND commit: 250a88f (feat GREEN + dep bump)
- FOUND commit: 3303686 (feat wrap cards + routes)
