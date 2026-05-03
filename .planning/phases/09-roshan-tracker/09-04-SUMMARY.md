# Plan 09-04 — Summary

**Status:** Complete
**Wave:** 2
**Requirements:** ROSH-01, ROSH-02 (server side), ROSH-04

## What was built

1. **`server/src/services/roshanState.ts`** (~95 LOC). Exports:
   - `detectRoshanKill(prev, curTimer, gameTime, now)` — pure detector with D-04 bootstrap
   - `readRoshanState(matchId)` / `writeRoshanState(matchId, state)` — Redis I/O with graceful null-fallback, key `roshan:{matchId}`, TTL 6h
   - `RoshanState` interface
2. **`server/src/routes/live.ts`** — `/api/live/games` handler now does per-game Roshan I/O.
   - `games.map((g) => …)` → `await Promise.all(games.map(async (g) => …))` (no other handler in this file changed)
   - Read prev state → `detectRoshanKill` → conditional write only when state changed AND we either detected a kill or have a current scoreboard reading
   - `logger.info({ matchId, killNumber, prevTimer, curTimer }, 'roshan kill detected')` on every kill
   - Wire shape: `match.roshan: { killCount, alive, respawnIn, lastKillLoot } | null` (D-19)
   - `roshan === null` only when there is neither stored state nor a current scoreboard reading

## Tests transitioned RED → GREEN

- `server/src/services/roshanState.test.ts` — 14/14
- `server/src/routes/live.roshan.test.ts` — 6/6
  - first call: alive, killCount 0
  - 0→480: kill #1 with lastKillLoot=[117]
  - respawn: killCount stays 1, alive=true, respawnIn=null
  - second kill: killCount=2, lastKillLoot=[117, 1804]
  - schema parses roshan_respawn_timer:480 (validates Plan 03 schema work)
  - matchId 888 does NOT inherit state from 999 (ROSH-04)

Full server suite: **74/74 passing** — no regressions in /draft, /intel, /winprob, or any other handler.

## Insertion points (post-edit)

- `server/src/routes/live.ts` lines 10-12: new imports (`roshanState`, `roshanLoot`, `logger`)
- Line 32: `games.map((g) => {` → `await Promise.all(games.map(async (g) => {`
- Lines 108-146: Roshan inline block (read → detect → optional write → log → build wire shape)
- Line 156: `}))` (Promise.all close)

## Caching note for Plan 06 UAT

`getLiveLeagueGames()` IS cached at the service layer via `cached('live_games', TTL.LIVE_MATCH=30s, ...)` in `server/src/services/valveApi.ts:26`. The Roshan logic therefore runs at most once per 30s per match across N concurrent viewers. No additional protection needed.

## Commits

- `78f42e7` — feat(09-04): implement roshanState service (detector + Redis I/O)
- `14854f0` — feat(09-04): wire Roshan state into /api/live/games response

## Notes

- Test file `server/src/services/roshanState.test.ts` had a NodeNext import path fixed (`./roshanState` → `./roshanState.js`) — required by the project's `tsc --noEmit` config; included in the same commit as the new service.
- `roshan_respawn_timer` is preserved at the top level of each game (existing client consumers in `ScoreHeader.tsx` and `useLiveGames.ts` continue to work). RoshanBlock will consume the new structured `roshan` field instead.
