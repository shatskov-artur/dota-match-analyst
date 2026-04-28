---
phase: 07-in-game-item-intel
plan: "04"
subsystem: client/MatchPage integration
tags: [react, integration, items, scoreboard]
dependency_graph:
  requires: [07-02 (PlayerSchema + server itemMapper), 07-03 (client itemMapper + formatNW + ItemsBlock)]
  provides: [ItemsBlock visible in MatchPage for in-game matches]
  affects: []
tech_stack:
  added: []
  patterns: [scoreboard player merge+sort, team literal injection, draft.scoreboard gate]
key_files:
  created: []
  modified:
    - client/src/pages/MatchPage.tsx
decisions:
  - "Sort happens in MatchPage before passing to ItemsBlock — component stays stateless/presentational (RESEARCH.md pitfall 5)"
  - "Guard condition draft.scoreboard && mirrors DraftSection guard — ItemsBlock hidden during draft phase when scoreboard absent"
  - "as const on team literals ensures 'radiant' | 'dire' literal type required by ItemsBlock props interface"
  - "net_worth cast as number is safe — field is explicitly typed in PlayerSchema (z.number().optional()), passthrough spread adds index sig but typed field wins"
metrics:
  duration: "~3 minutes"
  completed: "2026-04-28"
  tasks_completed: 1
  files_created: 0
  files_modified: 1
---

# Phase 7 Plan 04: MatchPage ItemsBlock Integration Summary

ItemsBlock wired into MatchPage between HeroPlayerGrid and BuildingsSection — scoreboard player arrays merged, team field injected, sorted by net_worth descending, gated on scoreboard presence.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wire ItemsBlock into MatchPage with merge+sort of scoreboard players | 68d47b6 | client/src/pages/MatchPage.tsx |

## Checkpoint Reached

**Task 2: Human verification checkpoint** — pending user confirmation of visual rendering in a live in-game match.

The checkpoint asks the user to:
1. Start dev server (`npm run dev`)
2. Open a live in-game match (game_state=5, scoreboard present)
3. Scroll past HeroPlayerGrid to confirm ItemsBlock renders 10 NW-sorted rows with item icons

## Verification Results

- `grep "import ItemsBlock"` — 1 match (import present)
- `grep "ItemsBlock"` — 3 matches (import + JSX open + JSX close)
- `grep "draft.scoreboard.radiant"` — 1 match
- `grep "team: 'radiant' as const"` — 1 match
- `grep "team: 'dire' as const"` — 1 match
- `grep ".sort("` — 1 match (sort in MatchPage, not ItemsBlock)
- `grep "mt-12"` — 3 matches (HeroPlayerGrid, ItemsBlock, BuildingsSection)
- `cd client && npx tsc --noEmit` — exits 0 (clean)
- `cd client && npx vitest run` — 76/76 tests GREEN

## Deviations from Plan

None — plan executed exactly as written. The insertion point in the plan referenced `DotaMapView` (stale from an earlier UI spec version) but the actual MatchPage uses only `BuildingsSection` — this had no impact on the change since the insertion is between `HeroPlayerGrid </div>` and the buildings conditional, which is correct in both versions.

## Known Stubs

None — ItemsBlock receives live data from draft.scoreboard on the 30s polling cycle.

## Threat Model Coverage

| Threat ID | Status |
|-----------|--------|
| T-07-08 | Accepted — scoreboard data is public tournament match data, no PII |
| T-07-09 | Accepted — 10-element sort pre-pass before render, negligible compute |

## Self-Check: PASSED

- client/src/pages/MatchPage.tsx: FOUND (verified contents)
- Commit 68d47b6: FOUND
- TypeScript clean: CONFIRMED (tsc --noEmit exits 0)
- Tests GREEN: CONFIRMED (76/76 passing)
