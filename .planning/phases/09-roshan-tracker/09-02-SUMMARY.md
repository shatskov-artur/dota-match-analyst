# Plan 09-02 — Summary

**Status:** Complete
**Wave:** 1
**Requirements:** ROSH-01, ROSH-02

## What was built

Three small foundation pieces that everything else in Phase 9 depends on:

1. **`shared/roshanLoot.ts`** — patch-tagged loot table + `lookupRoshanLoot()` lookup. Flips Plan 01 Task 1 from RED to GREEN.
2. **`server/src/logger.ts`** — pino singleton (`logger`) per D-21. ~10 LOC. Used by D-05 Roshan kill logs.
3. **`server/src/cache.ts`** — exposed raw `redis` client as a named export so Plan 04 can do read-modify-write on the Roshan state key.

## Roshan loot table (verified patch 7.41, 2026-05-03)

```
Kill 1: [117]                  // Aegis
Kill 2: [117, 1804]            // Aegis + Roshan's Banner
Kill 3+: [117, 1804, 33, 260]  // Aegis + Banner + Cheese + Refresher Shard
```

Source: Liquipedia /Roshan §"Consumable Drops". Update `ROSHAN_LOOT_PATCH` in lockstep when Dota patches change loot.

## Confirmed exports

- `lookupRoshanLoot`, `ROSHAN_LOOT`, `ROSHAN_LOOT_PATCH` — `shared/roshanLoot.ts`
- `logger` — `server/src/logger.ts`
- `redis` (now exported) — `server/src/cache.ts`

## Commits

- `f98685a` — feat(09-02): add Roshan loot table (patch 7.41) + tests
- `0eaebfe` — feat(09-02): add pino logger scaffold (D-21)
- `2cfacad` — feat(09-02): export raw redis client from cache.ts

## Verification

- `npx tsc --noEmit` (server): clean
- `npx vitest run` (server): 54/54 passing — no regressions from cache.ts export
- `shared/roshanLoot.test.ts` flipped RED → GREEN (verified by Plan 02 executor agent before Tasks 2-3 were resumed inline)

## Notes for downstream plans

- Plan 04: `import { redis } from '../cache.js'` and `import { logger } from '../logger.js'` are now both available.
- Helpers like `getJson`/`setJson` were intentionally NOT added — the only stateful caller today is Roshan; revisit in Phase 10.
