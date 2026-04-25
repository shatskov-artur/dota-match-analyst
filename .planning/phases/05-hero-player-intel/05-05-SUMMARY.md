---
phase: 05-hero-player-intel
plan: 05
subsystem: ui
tags: [react, typescript, tailwind, tooltip, DraftPortrait, IntelTooltip, useLayoutEffect]

# Dependency graph
requires:
  - phase: 05-04
    provides: useHeroStats hook (HeroStatsEntry type), useMatchIntel hook (PlayerIntel, CounterHero types), winrateColor utility

provides:
  - IntelTooltip component: positioned floating card with viewport flip (useLayoutEffect), player stats + counter rows with ⚠ flag
  - DraftPortrait: badge strip overlay (DRAFT-03), hover tooltip trigger (DRAFT-04), overflow-hidden restructure (Pitfall 4 fix)

affects:
  - 05-06 (Wire plan — connects useHeroStats/useMatchIntel data to DraftPortrait props)
  - DraftTimeline, DraftColumn (must pass heroStats/playerIntel props through — Pitfall 6)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useLayoutEffect (not useEffect) for tooltip getBoundingClientRect measurement — fires before paint, prevents position flash"
    - "Outer relative wrapper WITHOUT overflow-hidden + inner div WITH overflow-hidden — allows absolute tooltip to escape clip boundary"
    - "RefObject<T | null> type in React 19 — useRef returns this narrower type, prop interfaces must match"

key-files:
  created:
    - client/src/components/IntelTooltip.tsx
  modified:
    - client/src/components/DraftPortrait.tsx

key-decisions:
  - "pick_rate is raw pro_pick count (not 0-1 percentage) — displayed as '{N}P' suffix rather than misleading percent"
  - "RefObject type updated to RefObject<HTMLDivElement | null> in IntelTooltip props to match React 19 useRef return type"
  - "Outer DraftPortrait wrapper changed from overflow-hidden to plain relative to allow IntelTooltip absolute positioning to escape clip boundary"

patterns-established:
  - "Tooltip positioning: useLayoutEffect + getBoundingClientRect on anchorRef, 180px viewport threshold for above/below flip"
  - "Badge strip condition: kind === pick AND heroId defined AND heroStats defined — silent when data absent"
  - "Tooltip render condition: kind === pick AND heroId defined AND playerIntel defined AND showTooltip — no render on bans or empty slots"

requirements-completed:
  - DRAFT-03
  - DRAFT-04
  - PLAYER-01
  - PLAYER-02

# Metrics
duration: 3min
completed: 2026-04-25
---

# Phase 5 Plan 05: IntelTooltip + DraftPortrait Badge Strip Summary

**IntelTooltip component with useLayoutEffect viewport-flip positioning + DraftPortrait badge strip overlay and hover trigger, restructured to avoid overflow clipping (Pitfall 4)**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-25T17:58:41Z
- **Completed:** 2026-04-25T17:58:41Z (approx)
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Created `IntelTooltip.tsx` with `useLayoutEffect`-based positioning — fires synchronously before browser paint, preventing the one-frame position flash that `useEffect` would cause (Pitfall 3)
- Tooltip flips below portrait when `anchorRef.getBoundingClientRect().top < 180` (D-07); renders loading skeleton (static grey placeholders, no animate-pulse) and hidden-profile em-dash display (PLAYER-02)
- Counter rows with 32px mini-portraits via `heroMapper` and `⚠` flag for `knownPlayers` (D-05, D-06)
- Modified `DraftPortrait.tsx`: outer wrapper is now `relative` WITHOUT `overflow-hidden` (Pitfall 4 fix) — only inner portrait div keeps `overflow-hidden` for image/ban-X/badge containment
- Badge strip (DRAFT-03) renders at bottom edge of pick portraits when `heroStats` is defined; ordinal badge and ban behavior unchanged from Phase 4

## Task Commits

1. **Task 1: Create IntelTooltip.tsx** — `0b10d33` (feat)
2. **Task 2: Modify DraftPortrait.tsx** — `c5f96ad` (feat)

## Files Created/Modified

- `client/src/components/IntelTooltip.tsx` — New positioned tooltip card: useLayoutEffect flip, loading skeleton, hidden-profile nulls, counter rows with ⚠
- `client/src/components/DraftPortrait.tsx` — Added `heroStats`/`playerIntel` props; restructured filled slot (outer relative no-overflow, inner portrait overflow-hidden); badge strip; IntelTooltip trigger

## Decisions Made

- **pick_rate display:** `pick_rate` from `HeroStatsEntry` is a raw `pro_pick` count (not a 0–1 percentage). Displayed as `{winRate}% · {N}P` — the "P" suffix distinguishes it from a percentage. If BFF is updated to return a normalized ratio, update the badge format accordingly.
- **RefObject<T | null>:** React 19's `useRef<HTMLDivElement>()` returns `RefObject<HTMLDivElement | null>`. The `IntelTooltip` prop type was updated to `RefObject<HTMLDivElement | null>` to match — this required a fix during Task 2 verification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed RefObject type mismatch for React 19**
- **Found during:** Task 2 (TypeScript compilation check)
- **Issue:** `IntelTooltip` props declared `anchorRef: React.RefObject<HTMLDivElement>` but React 19 `useRef<HTMLDivElement>()` returns `RefObject<HTMLDivElement | null>` — TS2322 error
- **Fix:** Changed prop type to `React.RefObject<HTMLDivElement | null>` in IntelTooltip.tsx
- **Files modified:** `client/src/components/IntelTooltip.tsx`
- **Verification:** `npx tsc --noEmit` → 0 errors
- **Committed in:** `c5f96ad` (Task 2 commit, bundled with DraftPortrait changes)

---

**Total deviations:** 1 auto-fixed (Rule 1 — type bug)
**Impact on plan:** Essential correctness fix for React 19 compatibility. No scope creep.

## Issues Encountered

None beyond the RefObject type fix documented above.

## Known Stubs

None. Both components receive props from the parent (wiring happens in Plan 05-06). Badge strip and tooltip are conditionally rendered when props are defined — they simply do not render when `heroStats`/`playerIntel` are `undefined` (the intended loading state per D-03).

## Threat Flags

None. `IntelTooltip` has `pointerEvents: none` — no click capture. All data is pre-validated server-side (T-5-01, T-5-03). Tooltip silently does not render when `playerIntel` is undefined (T-5-02).

## Next Phase Readiness

- `IntelTooltip.tsx` and modified `DraftPortrait.tsx` are ready to receive live data
- Plan 05-06 (Wire) must: call `useHeroStats()` and `useMatchIntel(matchId)` on `MatchPage`/`DraftSection`; thread `heroStats[heroId]` and `playerIntel` slices into `DraftTimeline` → `DraftColumn` → `DraftPortrait` (Pitfall 6 — both paths must be threaded)
- TypeScript compiles clean: 0 errors

## Self-Check: PASSED

- `client/src/components/IntelTooltip.tsx` exists: FOUND
- `client/src/components/DraftPortrait.tsx` modified: FOUND
- Commit `0b10d33` exists: FOUND
- Commit `c5f96ad` exists: FOUND
- `useLayoutEffect` in IntelTooltip (not useEffect): VERIFIED
- `overflow-hidden` in DraftPortrait className: ONLY on inner portrait div (line 80), not outer wrapper: VERIFIED
- TypeScript: 0 errors: VERIFIED

---
*Phase: 05-hero-player-intel*
*Completed: 2026-04-25*
