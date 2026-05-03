---
phase: 09-roshan-tracker
plan: 03
subsystem: schemas
tags: [zod, schema, valve, bff, roshan]
requires: [01]
provides:
  - "ScoreboardSchema.roshan_respawn_timer typed"
  - "ScoreboardSchema.duration typed"
  - "EnrichedLiveGameSchema.roshan field"
  - "RoshanStateSchema (wire shape)"
  - "RoshanState type"
affects:
  - server/src/schemas/valve.ts
  - server/src/schemas/bff.ts
tech-stack:
  added: []
  patterns: [".passthrough() preserved", "z.infer for exported types"]
key-files:
  created: []
  modified:
    - server/src/schemas/valve.ts
    - server/src/schemas/bff.ts
decisions:
  - "Wire RoshanState distinct from server-internal Redis blob (Plan 04) — accepted naming collision because modules don't co-import"
  - "Added duration to ScoreboardSchema alongside roshan_respawn_timer — eliminates a second cast in live.ts:58"
metrics:
  duration: "~5 min"
  tasks_completed: 2
  files_modified: 2
  completed: "2026-05-04"
---

# Phase 09 Plan 03: Schema Typing Summary

Locked the wire contract for the Roshan flow before Plan 04 wires up the writer: typed two raw-cast fields in ScoreboardSchema and added the BFF `roshan` response shape.

## What Changed

### `server/src/schemas/valve.ts`
- `ScoreboardSchema` extended with two optional fields:
  - `roshan_respawn_timer: z.number().optional()` — seconds; 0 = alive, >0 = dead. Replaces the `Record<string, unknown>` cast at `live.ts:59`.
  - `duration: z.number().optional()` — also surfaced via scoreboard, eliminates a second cast at `live.ts:58`.
- `.passthrough()` preserved (CLAUDE.md hard rule).

### `server/src/schemas/bff.ts`
- New exports:
  - `RoshanStateSchema` — wire shape: `{ killCount, alive, respawnIn, lastKillLoot }` per D-19.
  - `RoshanState` — TS type via `z.infer`.
- `EnrichedLiveGameSchema` extended with `roshan: RoshanStateSchema.nullable()` (null pre-game).

## Schema Diff

| Schema | Field | Type | Purpose |
|--------|-------|------|---------|
| `ScoreboardSchema` | `roshan_respawn_timer` | `z.number().optional()` | Eliminates cast at live.ts:59 |
| `ScoreboardSchema` | `duration` | `z.number().optional()` | Eliminates cast at live.ts:58 |
| `EnrichedLiveGameSchema` | `roshan` | `RoshanStateSchema.nullable()` | BFF wire contract for client |

## Naming Collision Note

Two distinct concepts share the name `RoshanState`:
1. **Wire shape** (this plan, `bff.ts`) — `{ killCount, alive, respawnIn, lastKillLoot }`. What the client receives.
2. **Server-internal Redis blob** (Plan 04, `services/roshanState.ts`) — `{ killCount, prevTimer, kills[] }`. What gets persisted.

Accepted because the modules don't co-import. If they ever do, prefer importing the wire one as `WireRoshanState`.

## Verification

- `cd server && npx tsc --noEmit` — clean
- `cd server && npx vitest run src/schemas` — 9/9 passed
- `cd client && npx tsc --noEmit` — clean (no consumer references roshan yet; field is additive)
- All grep gates from plan satisfied.

## Commits

- `1466c30` feat(09-03): add roshan_respawn_timer + duration to ScoreboardSchema
- `4132ef0` feat(09-03): add RoshanStateSchema + roshan field to EnrichedLiveGameSchema

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: server/src/schemas/valve.ts (modified)
- FOUND: server/src/schemas/bff.ts (modified)
- FOUND: commit 1466c30
- FOUND: commit 4132ef0
