---
plan: 05-06
phase: 05-hero-player-intel
status: complete
completed: "2026-04-26"
---

# Plan 05-06 Summary — Wire Hero Stats and Player Intel into Draft UI

## What Was Built

Threaded `heroStatsMap` and `playerIntelMap` from `MatchPage` through the full component hierarchy to `DraftPortrait`, completing Phase 5 feature delivery.

**Wiring chain:** `MatchPage` → `DraftSection` → `DraftTimeline` + `DraftColumn` → `DraftPortrait`

## Key Changes

### MatchPage.tsx
- Calls `useHeroStats()` and `useMatchIntel(matchId)`
- Builds `playerIntelMap` keyed by `heroId` (not `accountId`) for slot lookup
- Passes both maps to `DraftSection`

### DraftSection.tsx
- Accepts `heroStatsMap?` and `playerIntelMap?` props
- Forwards to **both** rendering paths: `DraftTimeline` (primary) and both `DraftColumn` instances (fallback) — Pitfall 6 fix

### DraftTimeline.tsx
- Accepts `heroStatsMap?` and `playerIntelMap?` props
- Renders winrate badge strip inside portrait cell (font 9, winrate only — space constrained)
- Renders `IntelTooltip` as sibling to portrait cell div (outside `overflow-hidden`) — Pitfall 4 fix
- Uses single `hoveredStep: number | null` state for hover tracking across 24 slots

### DraftColumn.tsx
- Accepts `heroStatsMap?` and `playerIntelMap?` props
- Passes `heroStats` and `playerIntel` slices to each pick `DraftPortrait`
- Ban slots receive no intel props (by design — D-02)

## Test Results

- Client: 58/58 tests GREEN
- Server: 30/30 tests GREEN
- TypeScript: 0 errors

## Human Checkpoint

Approved by user — badge strips visible on picks, tooltip appears on hover, no JS errors.

## Self-Check: PASSED

key-files.created:
  - client/src/components/DraftTimeline.tsx
  - client/src/components/DraftColumn.tsx
  - client/src/components/DraftSection.tsx
  - client/src/pages/MatchPage.tsx
