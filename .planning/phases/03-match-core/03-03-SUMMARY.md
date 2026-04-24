---
phase: 03-match-core
plan: "03"
subsystem: client-components
tags: [player-row, score-header, skeleton, hero-portrait, kda, gold-diff, series-score]
dependency_graph:
  requires:
    - client/src/utils/heroMapper.ts (browser-safe hero ID → name+portrait, Plan 01)
    - client/src/utils/formatGoldDiff.ts (gold diff formatter, Plan 01)
    - client/src/utils/gameState.ts (getStatusLabel, getSeriesLabel)
    - client/src/components/StatusTag.tsx (StatusTag component, Phase 2)
    - shared/hiddenProfile.ts (hidden profile guard, @shared alias)
    - client/src/components/SkeletonRow.tsx (shimmer animation pattern reference)
  provides:
    - client/src/components/SkeletonPlayerRow.tsx (skeleton loading row for match page)
    - client/src/components/PlayerRow.tsx (one player row with portrait, K/D/A, NW, optional stats)
    - client/src/components/ScoreHeader.tsx (match score header with gold diff, series, delay)
  affects:
    - client/src/components/HeroPlayerGrid.tsx (Plan 04 — consumes PlayerRow + SkeletonPlayerRow)
    - client/src/pages/MatchPage.tsx (Plan 04 — consumes ScoreHeader + SkeletonPlayerRow)
tech_stack:
  added: []
  patterns:
    - Opacity-only dead hero overlay (no CSS filter, no tint) — per D-06 / UI-SPEC
    - Draft slot detection via hero_id === undefined (explicit absence, not unknown ID)
    - hiddenProfile guard applied at render boundary — T-03-08 threat mitigation
    - Grid-level column flag pattern (hasGpm/hasXpm/hasLhDn) — hide column for all rows or none
    - skshimmer keyframe inline via <style> tag — acceptable duplicate per RESEARCH.md Pattern 8
key_files:
  created:
    - client/src/components/SkeletonPlayerRow.tsx
    - client/src/components/PlayerRow.tsx
    - client/src/components/ScoreHeader.tsx
  modified: []
decisions:
  - "isHidden variable declared but effect is silent — hidden profiles show Valve name+portrait+KDA without a UI label; matches D-07 spec and threat register T-03-08"
  - "getSeriesLabel returns '' (empty string) not null for unknown series_type — seriesScore ternary handles both empty string and null correctly (falsy check)"
  - "void isHidden used to suppress unused-variable warning without removing the guard variable, keeping threat model documentation in code"
metrics:
  duration: "~2 minutes"
  completed: "2026-04-24T18:14:14Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 0
---

# Phase 3 Plan 3: Leaf Components (SkeletonPlayerRow, PlayerRow, ScoreHeader) Summary

**One-liner:** Three leaf display components — shimmer skeleton row, player row with hero portrait/dead overlay/K-D-A, and score header with gold diff/series/delay — all purely presentational and ready for Plan 04 assembly.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create SkeletonPlayerRow component | 8b3b5dd | client/src/components/SkeletonPlayerRow.tsx (created) |
| 2 | Create PlayerRow component | 86e9805 | client/src/components/PlayerRow.tsx (created) |
| 3 | Create ScoreHeader component | 4d748d1 | client/src/components/ScoreHeader.tsx (created) |

## Verification

- `cd client && npx vitest run` — 27 tests, 4 files, all passed after each task
- All acceptance criteria verified via grep:
  - SkeletonPlayerRow: `skshimmer` animation, `skshimmer 2.4s ease-in-out infinite` timing, three bars (w-12, flex-1, w-32), `border-b` with `#1e1e1e`
  - PlayerRow: relative import `'../utils/heroMapper'`, `@shared/hiddenProfile`, `opacity: isDead ? 0.3 : 1`, `player.death` (singular), `isDraftSlot = player.hero_id === undefined`, `{player.respawn_timer}s`, `hasGpm`/`hasXpm`/`hasLhDn` in props and conditionals, no `filter:` CSS property
  - ScoreHeader: `formatGoldDiff` from `'../utils/formatGoldDiff'`, `getSeriesLabel`, `StatusTag` usage, `goldDiff.color`, `stream_delay_s` with fallback `~120s delay`, `radiantNW` from `players?.filter(p => p.team === 0)`, `text-[28px]` kill score typography

## Deviations from Plan

None — plan executed exactly as written. The `getSeriesLabel` function returns `string` (not `string | null` as the plan interface description suggested), but the falsy check `seriesLabel ? ...` handles empty string correctly without any code change needed.

## Known Stubs

None — all three components are fully implemented and render their props directly. No hardcoded placeholders, no TODO comments, no deferred data wiring.

## Threat Flags

None — components render React text nodes only (no dangerouslySetInnerHTML), hero portrait src comes from static `heroes.json` bundle (not API response), and hiddenProfile guard is applied at PlayerRow render boundary per T-03-08.

## Self-Check: PASSED

- `client/src/components/SkeletonPlayerRow.tsx` — FOUND
- `client/src/components/PlayerRow.tsx` — FOUND
- `client/src/components/ScoreHeader.tsx` — FOUND
- Commit 8b3b5dd — FOUND
- Commit 86e9805 — FOUND
- Commit 4d748d1 — FOUND
