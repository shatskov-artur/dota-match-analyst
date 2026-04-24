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
  tasks_completed: 3
  tasks_pending: 1
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
| 4 | Human verification — confirm timeline renders correctly in browser | PENDING | — |

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

## Task 4: Human Checkpoint (PENDING)

**Status:** AWAITING HUMAN VERIFICATION

**Verification steps** (from plan):
1. Run `npm run dev` from repo root, open http://localhost:5173/, click any match with draft data.
2. Confirm single horizontal row of up to 24 slots in draft order (step numbers 1-24 above, R/D letters below in green/red).
3. Confirm slots fill left-to-right as draft progresses.
4. Confirm ban X overlay on banned hero portraits.
5. Confirm active next-to-fill slot has ember-tinted pulsing border (game_state === 2).
6. Confirm fallback to two-column layout before first-pick team is disambiguated.
7. Confirm phase label (DraftTurnIndicator) still shows above the timeline.

**Resume signal:** "approved" or "approved — draft verification deferred"

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
