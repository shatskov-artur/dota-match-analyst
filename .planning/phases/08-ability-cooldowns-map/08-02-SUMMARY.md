---
phase: 08-ability-cooldowns-map
plan: 02
status: complete
completed: 2026-04-28
---

# 08-02 Summary — BFF: PlayerSchema + scoreboard merge for phase-8 fields

## What was built

Extended the BFF data pipeline so the four Valve `position_x`, `position_y`, `ultimate_state`, `ultimate_cooldown` fields flow end-to-end through `/api/live/games` for every live tournament match. Purely additive — no new routes, no new caches, no new TTLs. Mirrors Phase 7's item-merge idiom one-for-one.

## Diffs

### `server/src/schemas/valve.ts` (lines 35-43)

7 lines inserted inside `PlayerSchema.object({...})`, immediately after `item8`, before `.passthrough()`:

```ts
// Phase 8: ability cooldowns + map positions — all optional, absent during draft.
// VERIFIED 2026-04-28 against real GetLiveLeagueGames payload: field names are
// position_x / position_y (NOT x_pos / y_pos as in earlier ROADMAP/CONTEXT drafts).
position_x: z.number().optional(),         // float, range ~±8192, centered at 0
position_y: z.number().optional(),         // float, range ~±8192, +Y = North (Y-flip required for SVG)
ultimate_state: z.number().int().optional(), // 0=unavail/dead, 1=ready, 2=cooldown, 3=charging
ultimate_cooldown: z.number().optional(),  // seconds remaining
```

### `server/src/routes/live.ts` (lines 96-101 inside `/games` map)

5 lines appended to the per-player merge object, after `item8: stats.item8 ?? p.item8,`:

```ts
// Phase 8 fields — surface scoreboard position + ultimate state into top-level players[]
position_x: stats.position_x ?? p.position_x,
position_y: stats.position_y ?? p.position_y,
ultimate_state: stats.ultimate_state ?? p.ultimate_state,
ultimate_cooldown: stats.ultimate_cooldown ?? p.ultimate_cooldown,
```

`/draft/:matchId`, `/intel/:matchId`, `/winprob/:matchId` untouched.

## Verification

- `cd server && npx tsc --noEmit` → exit 0, no errors.
- `cd server && npx vitest run` → **54/54 tests pass** (7 test files), including all 4 new `PlayerSchema phase-8 fields` tests from Plan 01:
  - accepts position_x/y, ultimate_state, ultimate_cooldown as optional numbers — GREEN
  - accepts player with phase-8 fields omitted — GREEN
  - rejects non-numeric `ultimate_state: 'active'` — GREEN (RED→GREEN flip)
  - passthrough preserves unknown fields like `position_z` — GREEN
- `.passthrough()` count in valve.ts: **6** (PlayerSchema + TeamSchema + DraftItemSchema + TeamScoreboardSchema + ScoreboardSchema + LiveGameSchema + LiveLeagueGamesSchema, all preserved).
- `grep -c "x_pos\|y_pos" server/src/schemas/valve.ts server/src/routes/live.ts` → 0 (wrong field names not introduced).

## Commits

- `10fdab7` feat(08-02): extend PlayerSchema with phase-8 fields (position_x/y, ultimate_state, ultimate_cooldown)
- `34be448` feat(08-02): surface phase-8 fields through /api/live/games scoreboard merge

## Notable

- Sandbox quirk: gsd-executor sub-agent could not perform Edits in this environment (both worktree and main-tree spawns hit a permission denial despite Read-before-Edit being satisfied). Orchestrator applied the patches inline using the verbatim `<action>` blocks from PLAN.md. No deviation from spec — every grep acceptance criterion is met.
- Plan 01's RED schema test became GREEN exactly as predicted: the `z.number().int()` constraint on `ultimate_state` is what causes the string `'active'` to be rejected.
