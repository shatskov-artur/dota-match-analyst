---
phase: 07-in-game-item-intel
plan: "02"
subsystem: server/schemas + shared/itemMapper
tags: [schema, zod, items, node-only, createRequire]
dependency_graph:
  requires: [07-01 (shared/items.json)]
  provides: [PlayerSchema item fields, shared/itemMapper.ts]
  affects: [07-03-PLAN (client itemMapper GREEN), 07-04-PLAN (ItemsBlock component)]
tech_stack:
  added: []
  patterns: [zod optional fields, createRequire Node.js pattern, reverse id-to-name lookup]
key_files:
  created:
    - shared/itemMapper.ts
  modified:
    - server/src/schemas/valve.ts
decisions:
  - "itemMapper builds reverse id->name lookup at module load (O(1) per call) — items.json is name-keyed unlike heroes.json which is id-keyed"
  - "All 10 item fields (item0-item5, item_neutral, item6-item8) typed as z.number().optional() — absent during draft, present in-game"
  - "VERIFY comments kept on item_neutral and item6 per D-04 — field names must be confirmed against live Valve API at runtime"
metrics:
  duration: "3m"
  completed: "2026-04-28"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Phase 7 Plan 02: PlayerSchema Item Fields + Server-Side itemMapper Summary

Extended PlayerSchema with typed item slot fields and created shared/itemMapper.ts — a Node.js-only reverse-lookup mapper that resolves Valve item IDs to name strings using the items.json snapshot from 07-01.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend PlayerSchema with item0-item5, item_neutral, item6-item8 | 07ee7e4 | server/src/schemas/valve.ts |
| 2 | Create shared/itemMapper.ts (server-side Node.js mapper) | 6a606d2 | shared/itemMapper.ts |

## Verification Results

- `server/src/schemas/valve.ts`: 10 item fields added (item0-item5, item_neutral, item6-item8), all `z.number().optional()`
- All `.passthrough()` calls preserved (8 call sites: PlayerSchema, TeamSchema, DraftItemSchema, TeamScoreboardSchema, ScoreboardSchema, LiveGameSchema, LiveLeagueGamesSchema inner + outer)
- TypeScript compiles clean in server/ (no new errors introduced)
- `shared/itemMapper.ts`: createRequire pattern, idToName reverse lookup built at module load, itemMapper(id) returns string | null
- No "heroes" reference in itemMapper.ts (confirmed 0 matches — correct JSON used)
- Function signature: `(id: number): string | null` — matches client-side equivalent signature

## Deviations from Plan

None - plan executed exactly as written.

## Threat Model Coverage

| Threat ID | Status |
|-----------|--------|
| T-07-03 | Mitigated — all item fields z.number().optional(); .passthrough() preserves unknowns |
| T-07-04 | Mitigated — idToName loop runs once at module load; no user input reaches the loop |

## Known Stubs

None — both files are complete implementations. itemMapper.ts is ready for use in BFF routes.

## Self-Check: PASSED

- server/src/schemas/valve.ts item0 field: FOUND
- server/src/schemas/valve.ts item_neutral field: FOUND
- server/src/schemas/valve.ts item6 field: FOUND
- shared/itemMapper.ts: FOUND
- Commit 07ee7e4: FOUND
- Commit 6a606d2: FOUND
