---
phase: 07-in-game-item-intel
verified: 2026-04-28T22:14:00Z
status: gaps_found
score: 5/8 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Item icons from Valve CDN are visible (SC-02)"
    status: failed
    reason: "MatchPage feeds radiantPlayers/direPlayers from useMatchDetail (via /api/live/games) to ItemsBlock. The BFF merge in live.ts (lines 72-88) only spreads combat stats (kills, death, assists, net_worth, level, respawn_timer, gpm, xpm, lh, dn) — item fields (item0-item5, item_neutral, item6-item8) are never included. All item slots will be undefined, causing every slot to render as a dark placeholder. Item icons never load."
    artifacts:
      - path: "server/src/routes/live.ts"
        issue: "Player merge at lines 72-88 does not copy item0-item5, item_neutral, item6-item8 from scoreboard players to top-level players array"
      - path: "client/src/pages/MatchPage.tsx"
        issue: "ItemsBlock receives radiantPlayers/direPlayers (missing item fields) instead of draft.scoreboard.radiant.players / draft.scoreboard.dire.players"
    missing:
      - "In live.ts player merge, add item0, item1, item2, item3, item4, item5, item_neutral, item6, item7, item8 to the stats spread (lines 72-88)"
      - "OR: change MatchPage to source ItemsBlock players from draft.scoreboard.radiant.players / draft.scoreboard.dire.players (as specified in 07-04-PLAN.md)"

  - truth: "User sees all 10 heroes sorted descending by net worth in a dedicated block (SC-01) — partial"
    status: partial
    reason: "The sort logic and ranking UI are correctly implemented. However, since item data is absent from the player source (same root cause as SC-02 gap), the ItemsBlock guard condition changed from draft.scoreboard presence to match.game_state===5 && radiantPlayers.length>0. This means NW sort works (net_worth IS in the merge), but the rendered block would show all-empty item slots."
    artifacts:
      - path: "client/src/pages/MatchPage.tsx"
        issue: "Guard changed from plan's 'draft.scoreboard &&' to 'match?.game_state === 5 && radiantPlayers.length > 0' — sourcing wrong player array"
    missing:
      - "Fix the data source so item fields are present; the sort/ranking code itself is correct"

  - truth: "Human verified: 10 NW-sorted rows visible with item icons in a live in-game match"
    status: failed
    reason: "Plan 07-04 Task 2 is a blocking human-verify checkpoint that was not completed. The SUMMARY notes 'Task 2: Human verification checkpoint — pending user confirmation'. SC-01, SC-02, SC-03, SC-04 all require human visual confirmation per the plan."
    artifacts:
      - path: ".planning/phases/07-in-game-item-intel/07-04-SUMMARY.md"
        issue: "Human checkpoint explicitly marked as pending (not approved)"
    missing:
      - "Human must start dev server, open a live in-game match, and confirm: 10 rows visible, item icons load, empty slots are placeholders, items update on 30s cycle"
---

# Phase 7: In-Game Item Intel Verification Report

**Phase Goal:** A user watching a live match sees all ten heroes ranked by net worth with their current items displayed as icons, so they can instantly read who is strongest and what power spikes are coming.
**Verified:** 2026-04-28T22:14:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-01 | User sees all 10 heroes sorted descending by net worth in a dedicated block | PARTIAL | Sort logic correct, net_worth present in data — but player source missing item fields (same root cause as SC-02); NW display works, item display does not |
| SC-02 | Each hero row shows 6 item icon slots (empty slot rendered as placeholder) | FAILED | BFF /api/live/games merge does not copy item0-item5 to top-level players. All slots will always be undefined → dark placeholders only, never real item icons |
| SC-03 | Items update on the same 30s polling cycle as the match screen | PARTIAL | The 30s polling hook (useMatchDetail) is already in scope and ItemsBlock is wired to it. If the data-flow gap is fixed, SC-03 will be satisfied automatically |
| SC-04 | Missing or unknown item IDs render as empty slot, not an error | VERIFIED | ItemSlot renders dark placeholder for null/undefined/0 with aria-label="Empty item slot". onError fallback via useState(imgError). No throws. |

**Score:** 1.5/4 success criteria fully verified (SC-04 verified; SC-03 pending fix; SC-01/SC-02 blocked on data-flow gap)

### Plan Must-Haves Score: 5/8 verified

| # | Must-Have | Status | Evidence |
|---|-----------|--------|----------|
| 1 | shared/items.json exists with 400+ items, blink.id===1, no "0" key | VERIFIED | 501 items, blink.id=1, no "0" key, no item_ prefix — confirmed by node check |
| 2 | itemMapper.test.ts and formatNW.test.ts both pass (GREEN) | VERIFIED | 9/9 tests pass in vitest run |
| 3 | PlayerSchema has item0-item5, item_neutral, item6-item8 as z.number().optional() | VERIFIED | valve.ts lines 26-35 — all 10 fields present, .passthrough() preserved (11 call sites) |
| 4 | shared/itemMapper.ts exports itemMapper with createRequire + idToName reverse lookup | VERIFIED | File exists, createRequire pattern, idToName built at module load — verified by read |
| 5 | client/src/utils/itemMapper.ts exports itemMapper (Vite JSON import) | VERIFIED | Vite JSON import from ../../../shared/items.json, idToName reverse lookup, returns string or null |
| 6 | client/src/utils/formatNW.ts exports formatNW | VERIFIED | Correct threshold (>=1000), toFixed(1)+'k', em dash for undefined — all 5 test cases GREEN |
| 7 | ItemsBlock renders pre-sorted players with rank/portrait/NW/6 item slots, onError fallback, team rank colors | VERIFIED | Component exists, imports itemMapper and formatNW, CDN URL pattern, aria-label placeholder, #4ade80/#ef4444 colors, onError handler, no internal sort |
| 8 | MatchPage wires ItemsBlock with scoreboard player data (item fields present), gated on scoreboard | FAILED | MatchPage wires ItemsBlock but from radiantPlayers (useMatchDetail) — not scoreboard players. Item fields absent from this source. Guard also changed from draft.scoreboard to game_state===5 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `shared/items.json` | 400+ items, name-keyed | VERIFIED | 501 items, blink.id=1 |
| `client/src/utils/itemMapper.test.ts` | 4 test cases GREEN | VERIFIED | 4 cases pass |
| `client/src/utils/formatNW.test.ts` | 5 test cases GREEN | VERIFIED | 5 cases pass |
| `server/src/schemas/valve.ts` | PlayerSchema with item0-item5, item_neutral, item6-item8 | VERIFIED | Lines 26-35 |
| `shared/itemMapper.ts` | createRequire, idToName, itemMapper export | VERIFIED | Exists and correct |
| `client/src/utils/itemMapper.ts` | Vite JSON import, idToName, itemMapper export | VERIFIED | Exists and correct |
| `client/src/utils/formatNW.ts` | formatNW with k-notation and em dash | VERIFIED | Exists and correct |
| `client/src/components/ItemsBlock.tsx` | Rank/portrait/NW/6 slots/onError/colors | VERIFIED | Exists, fully implemented |
| `client/src/pages/MatchPage.tsx` | ItemsBlock wired with scoreboard player data | FAILED | Wired but wrong data source — item fields missing |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| client/src/utils/itemMapper.ts | shared/items.json | Vite JSON import | WIRED | `import items from '../../../shared/items.json'` |
| client/src/components/ItemsBlock.tsx | client/src/utils/itemMapper.ts | `import { itemMapper }` | WIRED | Line 3 |
| client/src/components/ItemsBlock.tsx | client/src/utils/formatNW.ts | `import { formatNW }` | WIRED | Line 4 |
| client/src/pages/MatchPage.tsx | client/src/components/ItemsBlock.tsx | `import ItemsBlock` + JSX | WIRED | Line 14 + lines 104-113 |
| client/src/pages/MatchPage.tsx | draft.scoreboard.radiant.players | players prop | NOT_WIRED | Plan specified scoreboard players; actual uses radiantPlayers (missing item fields) |
| server/src/routes/live.ts | scoreboard item fields | BFF merge | NOT_WIRED | Merge at lines 72-88 omits item0-item5; only combat stats copied |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| ItemsBlock.tsx (item icons) | item0-item5 on each player | radiantPlayers / direPlayers from useMatchDetail | No — item fields not included in BFF /api/live/games merge | HOLLOW — wired but item data disconnected |
| ItemsBlock.tsx (net worth) | net_worth on each player | radiantPlayers from useMatchDetail | Yes — net_worth is copied in BFF merge (live.ts line 80) | FLOWING |
| ItemsBlock.tsx (hero portraits) | hero_id on each player | radiantPlayers from useMatchDetail | Yes — hero_id present on top-level players | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| itemMapper(1) returns "blink" | vitest run src/utils/itemMapper.test.ts | PASS | PASS |
| formatNW(12400) returns "12.4k" | vitest run src/utils/formatNW.test.ts | PASS | PASS |
| Full client test suite | vitest run (76 tests) | 76/76 GREEN | PASS |
| TypeScript compiles | npx tsc --noEmit | Exit 0 | PASS |
| Item fields in BFF merge | live.ts lines 72-88 grep for item0 | Not found | FAIL — item fields absent from merge |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SC-01 | 07-01 to 07-04 | 10 heroes sorted by net worth | PARTIAL | Sort and NW display work; item icons do not (data-flow gap) |
| SC-02 | 07-03, 07-04 | 6 item icon slots per hero row | FAILED | Item fields not present in data source passed to ItemsBlock |
| SC-03 | 07-04 | Items update on 30s cycle | PARTIAL | 30s polling hook in scope; will work after data-flow gap fixed |
| SC-04 | 07-03 | Missing/unknown items render as placeholder | VERIFIED | ItemSlot placeholder div, onError fallback — no errors |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server/src/routes/live.ts | 72-88 | Player merge omits item0-item5 from scoreboard.players spread | Blocker | Item icons never render in ItemsBlock — all slots will be dark placeholders regardless of real items |

### Human Verification Required

#### 1. Visual Confirmation of ItemsBlock Rendering

**Test:** Start dev server (`npm run dev`), open a live in-game match (game_state=5, scoreboard present), scroll past HeroPlayerGrid.
**Expected:** 10 hero rows sorted descending by net worth, each showing 6 item icon slots loading from cdn.cloudflare.steamstatic.com. Currently BLOCKED by data-flow gap — will show all-empty placeholders even if heroes have items.
**Why human:** Visual rendering cannot be verified programmatically; also depends on a live match being available.

#### 2. 30s Polling Update of Items

**Test:** Keep match page open 30+ seconds, watch Network tab for `/api/live/games` refetch.
**Expected:** Item icons refresh when heroes buy new items.
**Why human:** Real-time behavior requiring a live match.

### Gaps Summary

**Root cause:** One data-flow break blocks SC-01 (partial) and SC-02 (fully). The BFF route `/api/live/games` (server/src/routes/live.ts) merges scoreboard stats into the top-level players array, but the merge only copies 10 combat fields and omits all item fields. MatchPage then passes these item-field-less players to ItemsBlock.

The plan (07-04) specified sourcing from `draft.scoreboard.radiant.players` / `draft.scoreboard.dire.players` — these scoreboard arrays carry the item fields explicitly typed by the PlayerSchema extension in plan 07-02. The implementation deviated to use `radiantPlayers` from `useMatchDetail`, which does not contain item data.

**Fix options (two equivalent approaches):**

1. **Fix the BFF merge** (server/src/routes/live.ts lines 72-88): add `item0, item1, item2, item3, item4, item5, item_neutral, item6, item7, item8` to the stats spread from scoreboard players. This keeps MatchPage's current approach and makes item data available in the main 30s polling cache.

2. **Fix MatchPage data source** (revert to plan spec): change ItemsBlock players prop to use `draft.scoreboard?.radiant?.players` and `draft.scoreboard?.dire?.players`, injecting `team` fields there. This uses the `/api/live/draft/:matchId` endpoint which already carries full scoreboard data including item fields. Guard would revert to `draft.scoreboard &&`.

Either fix is sufficient; option 1 (BFF merge) is preferable since it keeps all player data in one consolidated source and avoids dependency on the 5s-polling draft endpoint for a 30s-frequency feature.

**Human checkpoint also pending** — once data-flow gap is fixed, human must visually confirm SC-01 through SC-04 in a live match.

---

_Verified: 2026-04-28T22:14:00Z_
_Verifier: Claude (gsd-verifier)_
