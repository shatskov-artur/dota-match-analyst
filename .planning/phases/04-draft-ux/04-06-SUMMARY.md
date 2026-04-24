---
phase: 04-draft-ux
plan: "06"
subsystem: draft-ux
tags: [draft, timeline, CM-7.40, draftOrder, DraftTimeline, DraftSection]
dependency_graph:
  requires: [04-05]
  provides: [DraftTimeline, buildDraftTimeline, DraftTimelineSlot]
  affects: [DraftSection, draftOrder]
tech_stack:
  added: []
  patterns:
    - Pure buildDraftTimeline function derives 24-slot ordered timeline from Valve scoreboard data
    - DraftTimeline renders single flex-wrap row with phase dividers at CM 7.40 phase boundaries
    - DraftSection switches between timeline (primary) and DraftColumn stack (fallback) based on firstPickTeam
key_files:
  created:
    - client/src/components/DraftTimeline.tsx
  modified:
    - client/src/utils/draftOrder.ts
    - client/src/components/DraftSection.tsx
decisions:
  - buildDraftTimeline returns null when firstPickTeam is null so DraftSection falls back to existing two-column layout without any blank-screen risk
  - Phase dividers placed before steps 7, 11, 16, 20, 22 (CM 7.40 phase boundaries) as thin 1px vertical rules
  - DraftTimeline slot size reduced to 48x48 (w-12 h-12) vs DraftPortrait 56x56 (w-14 h-14) to fit all 24 slots without horizontal scroll on 1280px screens
  - activePickIndex/activeBanIndex removed from DraftColumn fallback path — DraftTimeline.isActive handles active slot tracking in the primary path
metrics:
  duration: ~15min
  completed: "2026-04-24T21:31:32Z"
  tasks_completed: 4
  tasks_pending: 0
  files_created: 1
  files_modified: 2
---

# Phase 04 Plan 06: Draft Timeline (gap-06) Summary

**One-liner:** Single 24-slot horizontal CM 7.40 draft timeline replacing per-team column layout, with pure `buildDraftTimeline` function and automatic fallback to two-column view when first-pick team is ambiguous.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add buildDraftTimeline + DraftTimelineSlot to draftOrder.ts | `5035808` | client/src/utils/draftOrder.ts |
| 2 | Create DraftTimeline.tsx (single 24-slot horizontal row) | `47900d1` | client/src/components/DraftTimeline.tsx |
| 3 | Update DraftSection.tsx to use DraftTimeline with DraftColumn fallback | `bba2952` | client/src/components/DraftSection.tsx |
| 4 | Human verification — timeline confirmed; API limitation documented | approved | — |

## Public API: buildDraftTimeline

```typescript
// DraftTimelineSlot — one entry per CM 7.40 step (0-indexed)
export interface DraftTimelineSlot {
  step: number           // 0-based global step (0 = first ban, 23 = last pick)
  team: 0 | 1           // 0 = Radiant, 1 = Dire
  action: 'pick' | 'ban'
  heroId: number | undefined  // hero_id from Valve scoreboard; undefined when slot unfilled
  isActive: boolean     // true when this is the NEXT slot to be filled
}

// buildDraftTimeline — reconstruct global CM 7.40 ordered slot array
export function buildDraftTimeline(
  scoreboard: {
    radiant?: { picks?: Array<{ hero_id?: number }>; bans?: Array<{ hero_id?: number }> }
    dire?:    { picks?: Array<{ hero_id?: number }>; bans?: Array<{ hero_id?: number }> }
  },
  firstPickTeam: 0 | 1 | null,
): DraftTimelineSlot[] | null
```

- Returns `null` when `firstPickTeam` is null (caller falls back to DraftColumn layout)
- Returns exactly 24 `DraftTimelineSlot` entries when `firstPickTeam` is 0 or 1
- Uses module-private `CM_740_RADIANT_FIRST` / `CM_740_DIRE_FIRST` sequences (no new exports needed)
- Pure function — no side effects, no React imports (safe for Phase 5/6 reuse)

## Automated Gates

| Gate | Result |
|------|--------|
| `cd client && npx vitest run src/utils/draftOrder.test.ts` | 13/13 pass |
| `cd client && npx tsc --noEmit` (Task 1) | exits 0 |
| `cd client && npx tsc --noEmit` (Task 2) | exits 0 |
| `cd client && npx tsc --noEmit` (Task 3) | exits 0 |
| `cd client && npx vitest run` (Task 3) | 46/46 pass |
| `cd client && npx vite build` (Task 3) | exits 0 |

## Task 4: Human Checkpoint (APPROVED)

**Status:** VERIFIED — approved 2026-04-24

**Findings during verification:**
- All automated checks (vitest 46/46, tsc, vite build) passed.
- Timeline renders fallback (two-column DraftColumn) for all tested matches because no active draft (game_state 2) was available — all live matches were in-game.
- Root cause confirmed: Valve API omits `game_state` for in-game matches AND only returns 3 bans/team (symmetric 3R+3D), so `inferFirstPickFromHistory` correctly returns null → timeline falls back. This is a Valve API constraint, not a code bug.
- Timeline will activate automatically for any match with game_state === 2 and asymmetric ban count (≥5 bans cast).
- Additional fix applied during session: `getStatusLabel` now detects in-game state from `scoreboard` presence (was showing "Unknown" for all in-game matches). Draft status now shows amber pulsing dot and sorts to top of league list.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — DraftTimeline renders live data from Valve scoreboard via heroMapper + buildDraftTimeline.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced.

## Self-Check

- [x] `client/src/utils/draftOrder.ts` — appended, not rewritten
- [x] `client/src/components/DraftTimeline.tsx` — created
- [x] `client/src/components/DraftSection.tsx` — replaced
- [x] Commit `5035808` exists (Task 1)
- [x] Commit `47900d1` exists (Task 2)
- [x] Commit `bba2952` exists (Task 3)
- [x] Existing exports `inferActiveTeam` and `inferFirstPickFromHistory` untouched
- [x] 46/46 vitest tests pass
- [x] vite build exits 0

## Self-Check: PASSED
