---
phase: 03-match-core
plan: "04"
subsystem: client-assembly
tags: [hero-player-grid, buildings-section, match-page, router, assembly]
dependency_graph:
  requires:
    - client/src/components/PlayerRow.tsx (Plan 03 output)
    - client/src/components/SkeletonPlayerRow.tsx (Plan 03 output)
    - client/src/components/ScoreHeader.tsx (Plan 03 output)
    - client/src/hooks/useMatchDetail.ts (Plan 02 output)
    - shared/buildingDecoder.ts (Plan 01 output — BuildingState, LaneBuildings interfaces)
  provides:
    - client/src/components/HeroPlayerGrid.tsx (two-group player grid with optional column detection)
    - client/src/components/BuildingsSection.tsx (lane schematic for tower/barracks state)
    - client/src/pages/MatchPage.tsx (full match detail page at /match/:matchId)
  affects:
    - client/src/App.tsx (router now serves MatchPage instead of MatchPlaceholder)
tech_stack:
  added: []
  patterns:
    - Grid-level optional column detection — hasGpm/hasXpm/hasLhDn computed once for all rows
    - BuildingDot opacity 0.25 for destroyed buildings — color #303030 (ink-3)
    - RADIANT_ORDER T1→T2→T3→meleeRax→rangedRax, DIRE_ORDER mirrored
    - BuildingsSection hidden via !buildings.unavailable gate (D-10)
    - mt-12 section separation between ScoreHeader, HeroPlayerGrid, BuildingsSection
key_files:
  created:
    - client/src/components/HeroPlayerGrid.tsx
    - client/src/components/BuildingsSection.tsx
    - client/src/pages/MatchPage.tsx
  modified:
    - client/src/App.tsx
decisions:
  - "HeroPlayerGrid ColHeaders defined as inner function component — avoids prop threading and keeps hasGpm/hasXpm/hasLhDn in closure scope"
  - "MatchPage uses font-bold (not font-black) per plan spec — UI-SPEC says weight 700, PATTERNS.md uses font-black as alt; plan spec is the tiebreaker"
  - "inline-block added to BuildingDot span so w-2 h-2 sizing applies correctly in flex context"
metrics:
  duration: "~2 minutes"
  completed: "2026-04-24T18:17:55Z"
  tasks_completed: 2
  tasks_total: 3
  files_created: 3
  files_modified: 1
---

# Phase 3 Plan 4: Assembly (HeroPlayerGrid, BuildingsSection, MatchPage, App.tsx) Summary

**One-liner:** Final assembly plan — HeroPlayerGrid and BuildingsSection container components wired into MatchPage root, App.tsx router swapped from MatchPlaceholder to MatchPage, making /match/:matchId fully navigable with score, hero grid, and buildings.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create HeroPlayerGrid and BuildingsSection components | 8374cd2 | client/src/components/HeroPlayerGrid.tsx (created), client/src/components/BuildingsSection.tsx (created) |
| 2 | Create MatchPage and swap App.tsx router | b08a17e | client/src/pages/MatchPage.tsx (created), client/src/App.tsx (modified) |

## Task 3 (Checkpoint — Pending Human Verification)

Task 3 is a `checkpoint:human-verify` gate. The automated work is complete. Human verification of the match screen in browser is pending.

## Verification

- `cd client && npx vitest run` — 27 tests, 4 files, all passed after each task
- All acceptance criteria verified:
  - HeroPlayerGrid: `hasGpm` optional column detection via `allPlayers.some((p) => (p as any).gpm !== undefined)`
  - HeroPlayerGrid: `isLoading` check renders SkeletonPlayerRow x 10
  - HeroPlayerGrid: Radiant label in `color: '#4ade80'`, Dire in `color: '#ef4444'`
  - BuildingsSection: `RADIANT_ORDER` starts with `'tier1'`, `DIRE_ORDER` starts with `'rangedRax'`
  - BuildingsSection: `BuildingDot` with `opacity: standing ? 1 : 0.25`
  - BuildingsSection: imports from `'@shared/buildingDecoder'`
  - MatchPage: contains `!buildings.unavailable` D-10 guard
  - MatchPage: contains `mt-12` for section separation
  - MatchPage: does NOT contain `MatchPlaceholder` or `DEV PLACEHOLDER`
  - App.tsx: contains `import MatchPage from './pages/MatchPage'`
  - App.tsx: does NOT contain `import MatchPlaceholder`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all components are fully wired. HeroPlayerGrid passes real player data from useMatchDetail, BuildingsSection renders real decoded building state, MatchPage uses live data from useMatchDetail hook.

## Threat Flags

None — components render React text nodes only. No dangerouslySetInnerHTML. matchId URL param used only for string comparison in useMatchDetail (T-03-09 mitigation: redirect to / when match not found after isFetched). Polling stops at game_state === 6 per T-03-11 (implemented in Plan 02 useMatchDetail).

## Self-Check: PASSED

- `client/src/components/HeroPlayerGrid.tsx` — FOUND
- `client/src/components/BuildingsSection.tsx` — FOUND
- `client/src/pages/MatchPage.tsx` — FOUND
- `client/src/App.tsx` — FOUND (modified)
- Commit 8374cd2 — FOUND
- Commit b08a17e — FOUND
