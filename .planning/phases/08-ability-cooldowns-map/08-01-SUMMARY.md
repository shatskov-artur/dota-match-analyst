---
phase: 08-ability-cooldowns-map
plan: 01
subsystem: static-asset + RED-state test stubs
tags: [phase-8, static-asset, tdd-red, valve-schema, dotaconstants]
requirements: [SC-08-01, SC-08-02, SC-08-04]
dependency-graph:
  requires: []
  provides:
    - shared/heroUltimates.json (hero_id → ultimate ability name)
    - scripts/build-hero-ultimates.ts (re-runnable generator)
    - client/src/utils/heroUltimateMapper.test.ts (RED contract for Plan 03)
    - client/src/utils/mapCoords.test.ts (RED contract for Plan 03)
    - server/src/schemas/valve.test.ts (RED contract for Plan 02 — phase-8 fields)
  affects:
    - package.json (devDep + build:ults script)
tech-stack:
  added:
    - dotaconstants@^10.8.0 (devDependency, build-time only)
  patterns:
    - Vite-native JSON import for shared assets
    - id-keyed flat object format mirroring shared/heroes.json
    - RED-then-GREEN TDD wave structure (test stubs precede implementation)
key-files:
  created:
    - shared/heroUltimates.json (127 entries)
    - scripts/build-hero-ultimates.ts
    - client/src/utils/heroUltimateMapper.test.ts
    - client/src/utils/mapCoords.test.ts
  modified:
    - package.json (add dotaconstants devDep + build:ults script)
    - package-lock.json (lockfile update for dotaconstants tree)
    - server/src/schemas/valve.test.ts (append Phase 8 PlayerSchema describe block)
decisions:
  - Filter facet/aspect ability names in addition to 'generic_hidden' when
    selecting the ultimate; current dotaconstants 10.x appends facet names
    (e.g. 'axe_one_man_army') after the real ultimate in abilities[].
metrics:
  duration: ~10 minutes
  completed: 2026-04-28
---

# Phase 8 Plan 01: Wave 0 Static Asset + RED-State Test Stubs Summary

Generated `shared/heroUltimates.json` (127 heroes) from dotaconstants and
committed three RED-state test files that lock Phase 8's verified contracts
(field names `position_x`/`position_y`, coordinate range ±8192 with mandatory
Y-flip) before any production code is written.

## Tasks Completed

| Task | Name                                                    | Commit  | Type    |
| ---- | ------------------------------------------------------- | ------- | ------- |
| 1    | Generate shared/heroUltimates.json from dotaconstants    | 8f5a793 | feat    |
| 2    | RED-state tests for heroUltimateMapper + mapCoords       | ff0ec09 | test    |
| 3    | RED-state PlayerSchema tests for phase-8 fields          | 117c917 | test    |

## Deliverables

### `shared/heroUltimates.json`
- 127 hero entries with sorted numeric keys.
- Verified anchors: `"1": "antimage_mana_void"`, `"2": "axe_culling_blade"`.
- Format: `{ "<hero_id>": "<ultimate_ability_name>" }` (mirrors heroes.json id-keyed flat structure with single string value).

### `scripts/build-hero-ultimates.ts`
- Re-runnable per Dota patch via `npm run build:ults`.
- Uses Vite-style ESM JSON imports (`with { type: 'json' }`).
- Resolves short_name from heroes.json portrait URLs, looks up
  `dotaconstants.hero_abilities[npc_dota_hero_<short>]`, filters out
  `generic_hidden` AND any facet/aspect ability names, takes the last
  remaining ability as the ultimate.

### RED-state test files

| File | Status | Notes |
|------|--------|-------|
| `client/src/utils/heroUltimateMapper.test.ts` | **RED** (module-not-found) | All 5 tests fail to load — `./heroUltimateMapper` source does not exist. Plan 03 lands the implementation. |
| `client/src/utils/mapCoords.test.ts` | **RED** (module-not-found) | All 5 tests fail to load — `./mapCoords` source does not exist. Plan 03 lands the implementation. |
| `server/src/schemas/valve.test.ts` (Phase 8 block) | **3/4 GREEN, 1 RED** | "rejects non-numeric ultimate_state" is RED — schema does not yet declare the field type. Plan 02 turns it GREEN. The other 3 already pass via `.passthrough()`. |

## Verification

- `npm run build:ults` exits 0 → "Wrote 127 hero ultimates to shared/heroUltimates.json".
- Anchor check: `node -e "..."` confirms `heroUltimates['1']==='antimage_mana_void'` and `['2']==='axe_culling_blade'`.
- `cd client && npx vitest run heroUltimateMapper.test.ts mapCoords.test.ts` → 2 failed suites, both with "Failed to load url" (module-not-found = expected RED state).
- `cd server && npx vitest run src/schemas/valve.test.ts` → 1 failed / 8 passed; the failure is exactly the non-numeric `ultimate_state` rejection test (expected RED for Plan 02).
- `git diff --name-only server/src/schemas/valve.ts` → empty (Plan 02 owns this file).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Generator algorithm: filter facet/aspect ability names in addition to `generic_hidden`**

- **Found during:** Task 1 verification (`node -e ...` failed with `Axe ultimate wrong: axe_one_man_army`).
- **Issue:** The plan algorithm "take last non-`generic_hidden` from `abilities[]`" was based on RESEARCH.md A1, which sampled an older dotaconstants revision. In dotaconstants 10.8.0, facet/aspect abilities (e.g. Axe's deprecated facet `axe_one_man_army`) are appended to the `abilities[]` array AFTER the real ultimate. Last-non-generic_hidden therefore returned `axe_one_man_army` instead of `axe_culling_blade`.
- **Fix:** Read `entry.facets[]`, build a Set of facet names, and exclude any ability whose name appears in that Set in addition to `generic_hidden`. Iterate from the end and pick the first ability that survives both filters.
- **Files modified:** `scripts/build-hero-ultimates.ts` (added `facets?: Array<{ name?: string }>` to interface; added Set-based filter step).
- **Commit:** 8f5a793.
- **Result:** Anchor verification passes (`'1' → 'antimage_mana_void'`, `'2' → 'axe_culling_blade'`).

### Skipped Heroes
None. The generator wrote 127 entries with no warnings to stderr — every hero in `shared/heroes.json` resolved to a non-empty ultimate.

### Authentication Gates
None.

## Threat Surface
No new runtime security surface. `shared/heroUltimates.json` is a static, repo-committed file; downstream consumers will only construct CDN URLs from a fixed base + name string from this controlled lookup map (T-08-02 mitigation in plan threat model is honored — file generated and committed, no runtime mutation).

## Self-Check: PASSED

Files verified to exist:
- FOUND: shared/heroUltimates.json (132 lines, 127 entries)
- FOUND: scripts/build-hero-ultimates.ts
- FOUND: client/src/utils/heroUltimateMapper.test.ts
- FOUND: client/src/utils/mapCoords.test.ts
- FOUND: server/src/schemas/valve.test.ts (modified)

Commits verified to exist on master:
- FOUND: 8f5a793 (Task 1 — feat)
- FOUND: ff0ec09 (Task 2 — test)
- FOUND: 117c917 (Task 3 — test)

Source files for RED tests verified absent (Plan 03 territory):
- OK: no client/src/utils/heroUltimateMapper.ts
- OK: no client/src/utils/mapCoords.ts

`server/src/schemas/valve.ts` verified unchanged (Plan 02 territory):
- OK: `git diff --name-only server/src/schemas/valve.ts` → empty.
