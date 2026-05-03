# Plan 09-01 — Summary

**Status:** Complete (all RED)
**Wave:** 0
**Requirements:** ROSH-01, ROSH-02, ROSH-03, ROSH-04

## What was built

Four RED test files locking the behavioural contract for the Roshan tracker before any production code is written. Plans 02–05 flip these to GREEN.

| File | Tests | Drives |
|------|-------|--------|
| `shared/roshanLoot.test.ts` | 9 | ROSH-02 — loot table |
| `server/src/services/roshanState.test.ts` | 14 | ROSH-01 detector + I/O, ROSH-04 isolation |
| `server/src/routes/live.roshan.test.ts` | 6 | E2E shape, persistence (D-08), ROSH-04 |
| `client/src/components/RoshanBlock.test.tsx` | 6 | D-10..D-14 UI contract incl. 1Hz tick |

## Test infra changes

Added to `client`:
- `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` (devDependencies)
- `client/vitest.config.ts` — sets `environment: 'jsdom'` while inheriting the React + Tailwind plugins from `vite.config.ts`.

## Commits

- `cd8af09` — test(09-01): RED tests for shared/roshanLoot loot table (Task 1)
- `35950bf` — test(09-01): RED tests for server/src/services/roshanState (Task 2)
- `36bece4` — test(09-01): RED tests for live.games match.roshan + RoshanBlock (Task 3)

## Notes for downstream plans

- **Plan 02** flipped `shared/roshanLoot.test.ts` to GREEN (loot table exists). Three test files remain RED until subsequent plans land.
- **Plan 04** must produce both `server/src/services/roshanState.ts` (flips roshanState.test.ts) AND wire `match.roshan` into `/api/live/games` (flips live.roshan.test.ts).
- **Plan 05** must produce `client/src/components/RoshanBlock.tsx` accepting `roshan: { killCount, alive, respawnIn, lastKillLoot } | null` and ticking the countdown client-side every 1s via `useEffect setInterval` (D-14 — see project memory `feedback_cooldown_ticking.md`, same pattern as CooldownsBlock).

## Recovery note

This plan's executor agents in Wave 1 hit sandbox write-permission denials partway through. Tasks 2 and 3 were finished inline by the orchestrator on master after Task 1 was already committed. Behaviour and content match the plan spec verbatim; no scope drift.
