---
phase: 04-draft-ux
plan: "01"
subsystem: server-schemas-tests, client-utils-tests, client-hooks-tests
tags: [tdd, red-state, vitest, scoreboard, draft-order, draft-cadence]
dependency_graph:
  requires:
    - 04-CONTEXT.md (D-08 turn-inference behavior; D-12/D-13 dynamic refetchInterval contract)
    - 04-RESEARCH.md (CM 7.40 sequence; scoreboard.{radiant,dire}.{picks,bans} shape)
  provides:
    - server/src/schemas/valve.test.ts — 5 it-blocks codifying ScoreboardSchema acceptance (turns GREEN once Plan 02 lands)
    - client/src/utils/draftOrder.test.ts — 13 it-blocks codifying CM 7.40 turn-order inference (RED, target for Plan 03)
    - client/src/hooks/useDraftDetail.test.ts — 6 it-blocks codifying computeDraftInterval cadence (RED, target for Plan 03)
  affects:
    - 04-02 (LiveGameSchema scoreboard regression contract — already GREEN after merge)
    - 04-03 (draftOrder util + computeDraftInterval helper exposed by useDraftDetail must satisfy these tests)
tech_stack:
  added: []
  patterns:
    - Pure-function tests for the cadence helper (no React renderer, no jsdom) — test the predicate, not the hook
    - Schema regression coverage drafted from the verified scoreboard.{radiant,dire}.{picks,bans} shape (RESEARCH §3)
    - CM 7.40 turn-order coverage drafted from the documented 24-step sequence (CONTEXT §specifics)
key_files:
  created:
    - server/src/schemas/valve.test.ts
    - client/src/utils/draftOrder.test.ts
    - client/src/hooks/useDraftDetail.test.ts
  modified: []
decisions:
  - "Did not add @testing-library/react or jsdom — useDraftDetail tests target an exported pure helper computeDraftInterval(gameState) so the test stays a unit test on a predicate, not a hook render"
  - "valve.test.ts ships GREEN instead of RED because Plan 02 was merged into the worktree base before this plan ran; the assertions are unchanged from the planned RED set, only the file-header comment was updated. Behaviour is identical: contract still defined here, schema still verified"
  - "Coverage matches D-08 turn-inference behavior including the tentative state that fires when counts are ambiguous between teams"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-24T20:18:00Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 0
---

# Phase 4 Plan 1: Red-State Test Scaffolds Summary

**One-liner:** Three Vitest files now codify DRAFT-01 / DRAFT-02 acceptance — ScoreboardSchema regression coverage, CM 7.40 turn-order inference, and dynamic 5s draft polling cadence — so Plan 02's backend and Plan 03's client work have falsifiable green targets.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Schema scoreboard regression test (5 it-blocks) | e9c3200 | server/src/schemas/valve.test.ts (created) |
| 2 | draftOrder turn-order inference tests (13 it-blocks) | e7cca98 | client/src/utils/draftOrder.test.ts (created) |
| 3 | useDraftDetail cadence helper tests (6 it-blocks) | 5f5162f | client/src/hooks/useDraftDetail.test.ts (created) |

## Diff Summary per File

### `server/src/schemas/valve.test.ts` (created — 66 lines, 5 it-blocks)
Validates the merged `LiveGameSchema` for scoreboard handling:
- pre-draft (no scoreboard field) parses without error
- both teams populated with picks + bans parses successfully
- unknown sub-fields on team scoreboards survive `.passthrough()`
- empty `{}` team objects do not throw
- `picks` entries with undefined `hero_id` parse (PF-8 — picks pre-lock)

### `client/src/utils/draftOrder.test.ts` (created — 94 lines, 13 it-blocks)
Codifies the CM 7.40 24-step inference contract:
- `inferDraftStep(scoreboard)` returns `null` when scoreboard is absent
- step 0 (no picks/bans) → ban phase 1, alternating start
- mid-ban-phase counts → continues alternating
- pick phase 1, pick phase 2, ban phase 3 boundaries
- final state (7 bans + 5 picks per team) → `{ done: true }`
- ambiguous symmetric counts emit `{ tentative: true, ... }` per D-08
- non-pick/ban steps map to `kind: 'ban' | 'pick'` correctly

### `client/src/hooks/useDraftDetail.test.ts` (created — 45 lines, 6 it-blocks)
Codifies the dynamic refetchInterval cadence helper:
- `computeDraftInterval(2)` → `5_000` (draft state polls at 5s)
- `computeDraftInterval(5)` → `false` (in-game stops draft polling — scoreboard is frozen)
- `computeDraftInterval(6)` → `false` (post-game stops polling — CLAUDE.md pitfall)
- `computeDraftInterval(undefined)` → `false` (no game_state yet)
- `computeDraftInterval(0)` → `false` (lobby)
- TanStack Query v5 callback signature: `(query) => query.state.data?.game_state` mapped to the same predicate

## Verification

- `cd server && npx vitest run src/schemas/valve.test.ts` → 5 PASS (turned green once Plan 02 schema landed)
- `cd client && npx vitest run src/utils/draftOrder.test.ts` → RED (`Failed to load url ./draftOrder`) — expected, Plan 03 implements this util
- `cd client && npx vitest run src/hooks/useDraftDetail.test.ts` → RED (`Failed to load url ./useDraftDetail`) — expected, Plan 03 implements this hook
- `grep -c "testing-library\|renderHook" client/src/hooks/useDraftDetail.test.ts` → 0 (no React renderer dependency)
- No production source files modified (only the 3 new test files committed)

## Deviations from Plan

**Rule 1 (Nyquist scope adjustment): `valve.test.ts` ships GREEN instead of RED.**

When 04-01 ran, the worktree base already contained Plan 04-02's commit `6f33089 feat(04-02): add ScoreboardSchema and TTL.DRAFT (D-15, D-17)`. The plan's planned RED state was also semantically incompatible with `.passthrough()` semantics — `scoreboard` would have survived as raw runtime data even pre-Plan-02. Test substance is unchanged (5 it-blocks, identical assertions); only the file-header comment was updated to reflect green-state regression coverage. No behavioural impact on Plans 03/04.

The two client tests remain RED as designed — Plan 03 will turn them green by exporting `inferDraftStep` from `client/src/utils/draftOrder.ts` and `computeDraftInterval` from `client/src/hooks/useDraftDetail.ts`.

## Authentication Gates

None — test-only plan, no production code touched.

## Known Stubs

None — these are intentional red-state contracts that define Plan 03's green target. They are not stubs, they are the falsifiable acceptance suite.

## Threat Flags

None — test files only, no production surface.

## SUMMARY.md Note

This SUMMARY.md was authored by the orchestrator after the executor reported its Write tool was denied creation of summary/findings .md files by a system policy. All commit data, file paths, line counts, and verification output are taken verbatim from the executor's structured inline return. Source-of-truth is the three commits e9c3200 / e7cca98 / 5f5162f, all present in master.

## Self-Check: PASSED

- `server/src/schemas/valve.test.ts` — FOUND on disk (66 lines, 5 it-blocks)
- `client/src/utils/draftOrder.test.ts` — FOUND on disk (94 lines, 13 it-blocks)
- `client/src/hooks/useDraftDetail.test.ts` — FOUND on disk (45 lines, 6 it-blocks)
- Commit `e9c3200` (Task 1) — FOUND in `git log --oneline`
- Commit `e7cca98` (Task 2) — FOUND in `git log --oneline`
- Commit `5f5162f` (Task 3) — FOUND in `git log --oneline`
