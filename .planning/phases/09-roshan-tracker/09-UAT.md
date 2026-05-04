# Phase 9 — UAT

**Date:** 2026-05-04
**Status:** Manual live-match walkthrough deferred
**Match used for UAT:** _none — see "Deferred UAT" below_

---

## Automated test sweep (full suites)

Run on master at commit `7b55cae` (Phase 9 Wave 3 complete) on 2026-05-04:

| Scope | Command | Result |
|-------|---------|--------|
| Server | `cd server && npx vitest run` | **74/74 passed** (9 test files) |
| Client | `cd client && npx vitest run` | **92/92 passed** (14 test files) |
| Phase 9 specific | `roshanLoot.test.ts` (9), `roshanState.test.ts` (14), `live.roshan.test.ts` (6), `RoshanBlock.test.tsx` (6) | **35/35 GREEN** |

No skipped tests, no `it.todo` / `it.skip`. RED-then-GREEN cadence verified by git log: each Wave 0 RED test commit precedes the corresponding implementation commit.

## Test transitions per plan

| Plan | RED tests authored | Flipped GREEN by |
|------|-------------------|------------------|
| 09-01 | 4 files / 35 tests | — (this plan only authors tests) |
| 09-02 | — | `shared/roshanLoot.test.ts` (9/9) |
| 09-04 | — | `roshanState.test.ts` (14/14) + `live.roshan.test.ts` (6/6) |
| 09-05 | — | `RoshanBlock.test.tsx` (6/6) |

## Build verification

- `cd server && npx tsc --noEmit` — clean
- `cd client && npx tsc --noEmit` — clean
- `cd client && npm run build` — built in 2.10s, no errors

## Layout preservation check (project memory)

`client/src/pages/MatchPage.tsx` diff between Phase 8 head and Phase 9 head shows only:
- 1 added import (`RoshanBlock`)
- 1 added JSX line: `<RoshanBlock roshan={match?.roshan ?? null} />` between `<DotaMapView … />` and `<CooldownsBlock … />`

DotaMapView and CooldownsBlock prop blocks are byte-identical. Right-column wrapper `<div className="flex flex-col gap-8" style={{ width: 320 }}>` unchanged. Other sections (BuildingsSection, ScoreHeader, WinProbBar, DraftSection, HeroPlayerGrid, ItemsBlock) untouched.

## Deferred UAT — what still needs a human

Manual UAT on a live tournament match was **deferred** per user direction at the Wave 4 checkpoint. To close out:

1. `npm run dev` (root) → open a live in-game pro match in browser.
2. Watch the right column under `<DotaMapView>` for the new `<RoshanBlock>`.
3. Observe at least one Roshan kill cycle:
   - **Alive state** — header `Roshan #N` with N = next kill number; loot icons (Aegis / Banner / Cheese / Refresher Shard) match the table for that N.
   - **Dead state on the same match** — countdown ticks once per second client-side; respawn label visible; dimmed icons of the *next* kill below.
   - **LAST DROP row** — appears immediately after the first kill, persists alive-and-dead.
4. Confirm `match.roshan` field arrives in the network response for `/api/live/games`.
5. Confirm the BFF logs one `roshan kill detected` line per detected kill (Railway logs or local stdout).

If any of those four checks fail, file a follow-up bug; the automated harness only proves contract conformance, not the loot table being current-patch correct against actual in-match drops.

## Patch-table caveat

Loot table `ROSHAN_LOOT` was verified against Liquipedia /Roshan §"Consumable Drops" on 2026-05-03 for patch 7.41 (`ROSHAN_LOOT_PATCH = '7.41'`). When Valve changes the patch, both `ROSHAN_LOOT` and `ROSHAN_LOOT_PATCH` must be updated in lockstep. The grep target `// VERIFIED: patch X` is intentional — see `shared/roshanLoot.ts:1`.

## Goal-backward conclusion

Phase goal: "A user always knows which Roshan kill is next and exactly what loot the killing team will receive, without having to count manually."

Code paths that deliver the goal:
- Detection: `server/src/services/roshanState.ts:detectRoshanKill` (D-01..D-04)
- Persistence: `roshan:{matchId}` Redis key with 6h TTL (D-06..D-09)
- Wire shape: `match.roshan` in `/api/live/games` response (Plan 04)
- UI: `RoshanBlock.tsx` + mount point in `MatchPage.tsx` (Plan 05)
- Loot data: `shared/roshanLoot.ts` (D-15..D-17)

Status with deferred UAT: **code complete; live behavior validated only by automated tests**. Treat UAT as outstanding work tracked in this file.
