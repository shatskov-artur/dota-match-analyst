---
phase: 04-draft-ux
verified: 2026-04-25T00:15:00Z
status: human_needed
score: 8/8 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Load a live match in draft state (game_state === 2) and confirm picks/bans render within ~5 seconds, the turn indicator shows the correct team/action label with ember glow, and /api/live/draft/:matchId fires every ~5s in DevTools Network tab."
    expected: "Two-column (DraftColumn fallback or 24-slot DraftTimeline) renders with hero portraits or bordered placeholders. Turn indicator displays 'RADIANT — PICKING' / 'DIRE — BANNING' etc. with the correct phase sub-label. Network requests every ~5s stop when game_state transitions out of 2."
    why_human: "Valve API constraint: during in-game matches ban counts are symmetric (3R+3D), so inferFirstPickFromHistory returns null and the DraftTimeline falls back to DraftColumn layout. The timeline path (buildDraftTimeline returning non-null) requires a live game_state===2 match with asymmetric ban counts (>=5 bans cast) to trigger. This visual + behavioral state cannot be verified programmatically."
---

# Phase 4: Draft UX Verification Report

**Phase Goal:** User watches the draft unfold in real time with clear turn indication
**Verified:** 2026-04-25T00:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | During draft phase, picks/bans update within ~5s (DRAFT-01) | VERIFIED | `useDraftDetail.ts` uses `refetchInterval: (q) => computeDraftInterval(q.state.data?.game_state)`. `computeDraftInterval(2) === 5_000` confirmed by 6/6 passing unit tests. `staleTime: 4_000` < `refetchInterval: 5_000` ensures polling fires. BFF route `GET /api/live/draft/:matchId` cached at `TTL.DRAFT = 4`. |
| 2 | Turn indicator shows which team is picking/banning (DRAFT-02) | VERIFIED | `DraftTurnIndicator.tsx` exists, returns null when `gameState !== 2`, renders `{Team} — {action}` label in team color with em-dash separator. Tentative state appends ` ?` with opacity 0.6. Phase sub-label (Ban Phase 1, etc.) shown below. Wired via `DraftSection.tsx` which passes `activeTeam`, `action`, `tentative`, `gameState`. |
| 3 | Polling switches to 5s during draft and stops when not in draft | VERIFIED | `computeDraftInterval`: `gs===2 → 5000`, all other values → `false` (including `gs===6` per CLAUDE.md Critical Pitfalls). `useDraftDetail` `enabled: !!matchId` prevents fetching when no match. 6 unit tests confirm all cadence branches. |
| 4 | Single 24-slot horizontal CM 7.40 timeline exists | VERIFIED | `DraftTimeline.tsx` (127 lines): renders `slots.map(slot => ...)` with step number above (slot.step + 1), 48×48 portrait cell, team label (R/D) below. Phase dividers at steps 7, 11, 16, 20, 22. Active empty slot has `animate-pulse` + ember border. Ban X SVG overlay on filled ban slots. |
| 5 | `buildDraftTimeline` + `DraftTimelineSlot` exported from draftOrder.ts | VERIFIED | Lines 121–183 of `draftOrder.ts`: `export interface DraftTimelineSlot` and `export function buildDraftTimeline`. Returns null when `firstPickTeam===null`, 24-slot array otherwise. Uses module-private `CM_740_RADIANT_FIRST`/`CM_740_DIRE_FIRST`. All 13 existing draftOrder tests still pass. |
| 6 | DraftSection falls back to DraftColumn when firstPickTeam is null | VERIFIED | `DraftSection.tsx` lines 37–72: `const firstPickTeam = inferFirstPickFromHistory(scoreboard)`, `const timeline = buildDraftTimeline(scoreboard, firstPickTeam)`. Ternary: `{timeline ? <DraftTimeline ... /> : <div className="flex flex-col gap-3"><DraftColumn ... /><DraftColumn ... /></div>}`. Fallback is wired. |
| 7 | Status tags show Draft/Live/Post-game correctly via scoreboard fallback | VERIFIED | `gameState.ts` line 15: `if (scoreboard != null) return 'Live'` — handles case where Valve omits `game_state` for in-game matches. `MatchRow.tsx` passes `game.scoreboard` as second arg; `LeagueAccordion.tsx` passes `a.scoreboard` / `b.scoreboard` for sort. StatusTag component renders Draft (amber pulse dot), Live (red glow dot), Post-game (grey), Unknown. |
| 8 | TypeScript compiles clean and all tests pass | VERIFIED | `cd client && npx tsc --noEmit` exits 0. `cd server && npx tsc --noEmit` exits 0. `cd client && npx vitest run` → 48/48 tests pass (6 files). `cd server && npx vitest run` → 18/18 tests pass (3 files). |

**Score:** 8/8 truths verified (automated)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/src/schemas/valve.ts` | ScoreboardSchema + DraftItemSchema + TeamScoreboardSchema + scoreboard field on LiveGameSchema | VERIFIED | DraftItemSchema (line 39), TeamScoreboardSchema (line 45), ScoreboardSchema (line 53), `scoreboard: ScoreboardSchema.optional()` (line 78). All use `.passthrough()`. |
| `server/src/cache.ts` | TTL.DRAFT = 4 constant | VERIFIED | Line 35: `DRAFT: 4, // D-15`. Existing LIVE_MATCH: 30 unchanged. |
| `server/src/services/valveApi.ts` | getLiveLeagueGamesFast() with distinct 'live_games:draft' cache key | VERIFIED | Lines 37–39: `export function getLiveLeagueGamesFast()` calling `cached('live_games:draft', TTL.DRAFT, fetchLiveLeagueGames)`. Distinct from 30s 'live_games' lane. |
| `server/src/routes/live.ts` | GET /api/live/draft/:matchId route | VERIFIED | Lines 60–78: numeric guard via `Number.isFinite(parsedId)`, 400 for invalid, 404 for non-live, 200 with `{ match_id, game_state, scoreboard }`. |
| `client/src/utils/draftOrder.ts` | inferActiveTeam + inferFirstPickFromHistory + buildDraftTimeline + DraftTimelineSlot | VERIFIED | All four exported (lines 53, 77, 121, 145). No imports — pure module. CM_740_RADIANT_FIRST has correct 24-step sequence: 7+4+5+4+2+2 = 24. Mirror function derives CM_740_DIRE_FIRST. 13 unit tests all pass. |
| `client/src/hooks/useDraftDetail.ts` | useDraftDetail hook + computeDraftInterval + 4 typed interfaces | VERIFIED | Exports: DraftItem, TeamScoreboard, Scoreboard, DraftResponse, computeDraftInterval, useDraftDetail. queryKey: `['draft', matchId]`, staleTime: 4_000, enabled: `!!matchId`. 6 unit tests all pass. |
| `client/src/hooks/useMatchDetail.ts` | Stale D-13 comment removed | VERIFIED | Contains "Draft-speed 5s polling lives in useDraftDetail (Phase 4 D-12/D-13)". Does not contain "Phase 4 upgrades to dynamic". Logic (refetchInterval: 30_000, staleTime: 25_000) unchanged. |
| `client/src/components/DraftPortrait.tsx` | 56×56 pick/ban/empty cell with ban X overlay | VERIFIED | w-14 h-14 (56px), heroMapper import from `../utils/heroMapper` (not @shared), SVG ban X with opacity 0.75, empty slot #141414/#1e1e1e, isActive adds animate-pulse + #b03030 border, ordinal badge on filled slots. |
| `client/src/components/DraftColumn.tsx` | Team column with 5 picks + 7 bans + ember glow | VERIFIED | Array.from({length: 5}) and Array.from({length: 7}), ember glow: 2px solid/dashed #b03030, shadows rgba(176,48,48,0.25/0.10), 160ms transitions, Radiant #4ade80 / Dire #ef4444 labels, isActive + tentative + activePickIndex + activeBanIndex props. |
| `client/src/components/DraftTurnIndicator.tsx` | Turn label returning null outside game_state===2 | VERIFIED | `if (gameState !== 2) return null` line 48. Em-dash in label string. getPhaseName internal helper covers all 6 CM 7.40 phases. Both render paths have phase sub-label. |
| `client/src/components/DraftSection.tsx` | Composes timeline (primary) + DraftColumn fallback | VERIFIED | Imports buildDraftTimeline, inferFirstPickFromHistory, DraftColumn, DraftTimeline, DraftTurnIndicator. currentStep computed from array lengths. mt-12 section wrapper. isActive condition includes `isDraft = gameState === 2` guard. |
| `client/src/components/DraftTimeline.tsx` | 24-slot horizontal CM 7.40 row | VERIFIED | 127 lines. PHASE_DIVIDER_BEFORE set. slot.step+1 step numbers. animate-pulse on isActiveEmpty. Ban X SVG identical to DraftPortrait. heroMapper from `../utils/heroMapper`. DraftTimelineSlot import from `../utils/draftOrder`. |
| `client/src/pages/MatchPage.tsx` | DraftSection wired between ScoreHeader and HeroPlayerGrid | VERIFIED | imports DraftSection + useDraftDetail. `const draft = useDraftDetail(matchId)`. `{draft.scoreboard && <DraftSection scoreboard={draft.scoreboard} ... />}` positioned after ScoreHeader block (line 60), before HeroPlayerGrid div (line 71). D-10 gate in place. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| MatchPage.tsx | useDraftDetail | hook call | WIRED | Line 13: `const draft = useDraftDetail(matchId)` |
| MatchPage.tsx | DraftSection.tsx | JSX | WIRED | Lines 60–68: `{draft.scoreboard && <DraftSection ... />}` with all 5 props |
| DraftSection.tsx | DraftTimeline.tsx | JSX (primary path) | WIRED | Line 53: `<DraftTimeline slots={timeline} gameState={gameState} />` |
| DraftSection.tsx | DraftColumn.tsx | JSX (fallback path) | WIRED | Lines 57–70: two DraftColumn instances with team/picks/bans/isActive/tentative |
| DraftSection.tsx | DraftTurnIndicator.tsx | JSX | WIRED | Lines 43–49: forwards activeTeam, action, tentative, gameState, currentStep |
| DraftColumn.tsx | DraftPortrait.tsx | JSX | WIRED | Lines 62–70 and 75–83: DraftPortrait with kind, heroId, isActive, ordinal |
| DraftPortrait.tsx | heroMapper.ts | import | WIRED | Line 1: `import { heroMapper } from '../utils/heroMapper'` — browser-safe (not @shared) |
| DraftTimeline.tsx | heroMapper.ts | import | WIRED | Line 1: `import { heroMapper } from '../utils/heroMapper'` — browser-safe |
| DraftTimeline.tsx | draftOrder.ts (DraftTimelineSlot) | type import | WIRED | Line 4: `import type { DraftTimelineSlot } from '../utils/draftOrder'` |
| DraftSection.tsx | draftOrder.ts (buildDraftTimeline + inferFirstPickFromHistory) | import | WIRED | Line 1: `import { inferFirstPickFromHistory, buildDraftTimeline } from '../utils/draftOrder'` |
| useDraftDetail.ts | draftOrder.ts (inferActiveTeam + inferFirstPickFromHistory) | import | WIRED | Line 2: `import { inferActiveTeam, inferFirstPickFromHistory } from '../utils/draftOrder'` |
| useDraftDetail.ts | GET /api/live/draft/:matchId | fetch | WIRED | Line 32: `fetch('/api/live/draft/${matchId}')` in fetchDraft() |
| live.ts (route) | getLiveLeagueGamesFast() | function call | WIRED | Line 67: `const data = await getLiveLeagueGamesFast()` |
| getLiveLeagueGamesFast() | cached('live_games:draft', TTL.DRAFT) | function call | WIRED | Line 38 of valveApi.ts: `return cached('live_games:draft', TTL.DRAFT, fetchLiveLeagueGames)` |
| MatchRow.tsx | getStatusLabel(game_state, scoreboard) | function call | WIRED | Line 14: `getStatusLabel(game.game_state, game.scoreboard)` — scoreboard fallback active |
| LeagueAccordion.tsx | getStatusLabel(game_state, scoreboard) | function call | WIRED | Lines 17–18: scoreboard passed for sort ordering |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| DraftTimeline.tsx | slots | buildDraftTimeline(scoreboard, firstPickTeam) in DraftSection.tsx | Yes — derived from Valve scoreboard.radiant/dire.picks/bans arrays from BFF | FLOWING |
| DraftTurnIndicator.tsx | activeTeam, action, tentative | inferActiveTeam + inferFirstPickFromHistory called in useDraftDetail.ts | Yes — derived from live scoreboard counts | FLOWING |
| DraftSection.tsx | scoreboard | useDraftDetail hook fetching /api/live/draft/:matchId → Valve API | Yes — real Valve picks/bans data; D-10 gate prevents mount when undefined | FLOWING |
| StatusTag in MatchRow | status | getStatusLabel(game.game_state, game.scoreboard) via useLiveGames | Yes — scoreboard fallback handles in-game state where game_state is absent | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| computeDraftInterval cadence | `cd client && npx vitest run src/hooks/useDraftDetail.test.ts` | 6/6 pass: gs===2→5000, gs===6→false, gs===5→false, undefined→false | PASS |
| CM 7.40 turn inference | `cd client && npx vitest run src/utils/draftOrder.test.ts` | 13/13 pass: all step boundaries, both first-pick orientations, draft-complete null | PASS |
| Server schema parsing | `cd server && npx vitest run src/schemas/valve.test.ts` | 5/5 pass: scoreboard optional/populated/passthrough/empty-teams/undefined-hero_id | PASS |
| TypeScript: client | `cd client && npx tsc --noEmit` | Exit 0 | PASS |
| TypeScript: server | `cd server && npx tsc --noEmit` | Exit 0 | PASS |
| All tests: client | `cd client && npx vitest run` | 48/48 pass (6 files) | PASS |
| All tests: server | `cd server && npx vitest run` | 18/18 pass (3 files) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DRAFT-01 | 04-01 through 04-06 | Picks and bans per team with hero portraits, updating every 5 seconds during draft | SATISFIED | useDraftDetail polls at 5s cadence (computeDraftInterval verified); DraftTimeline/DraftColumn render portraits from scoreboard; DraftPortrait handles pick/ban/empty states |
| DRAFT-02 | 04-01 through 04-06 | Which team is currently picking or banning | SATISFIED | DraftTurnIndicator shows team+action label; DraftColumn ember glow on active team; DraftSection computes isActive from activeTeam + isDraft guard |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| DraftPortrait.tsx | 14, 30 | "placeholder" in comments | Info | Not a stub — describes the intended empty-slot UI design per D-02/D-05 |
| DraftTurnIndicator.tsx | 52 | "neutral placeholder" in comment | Info | Not a stub — describes the D-08 fallback label when turn is ambiguous |

No blockers or warnings found. The "placeholder" mentions are in JSDoc describing the design, not in code that returns empty/hardcoded values to users.

### Human Verification Required

#### 1. Live draft visual + polling verification

**Test:** Start `npm run dev`, open `http://localhost:5173/`, find a match with status "Draft" (game_state === 2), navigate to its match page. Open DevTools Network tab filtered on "draft".

**Expected:**
- DraftSection appears between ScoreHeader and HeroPlayerGrid
- If firstPickTeam is determinable (asymmetric ban counts): 24-slot horizontal DraftTimeline renders with step numbers 1-24 and R/D labels
- If firstPickTeam is ambiguous (symmetric counts, typical during early draft): DraftColumn fallback shows Radiant column on top, Dire below, each with 5 pick slots + 7 ban slots
- Filled pick slots show hero portraits; filled ban slots show portraits with semi-transparent red X overlay
- Empty slots show bordered placeholders (#141414 bg, #1e1e1e border)
- Next-to-fill empty slot pulses with ember border (#b03030) via animate-pulse
- DraftTurnIndicator shows e.g. "RADIANT — PICKING" in green with phase sub-label "BAN PHASE 1"
- Active team's column shows 2px ember left-edge border + box-shadow glow
- `/api/live/draft/{matchId}` fires every ~5s in Network tab

**Why human:** Valve API returns symmetric ban counts (3R+3D) for all in-game matches, so the 04-06 SUMMARY documents that the timeline path (which requires asymmetric counts) can only be verified during a live game_state===2 match. The DraftColumn fallback is always exercised but the primary DraftTimeline path requires a live tournament draft to test. Polling cadence and visual rendering require a running browser session.

#### 2. Polling stop verification

**Test:** With DevTools Network open, navigate from a draft match to an in-game or post-game match.

**Expected:** `/api/live/draft/:matchId` fires once on initial load then stops. No zombie polling requests.

**Why human:** Requires browser + live matches; cannot be verified by static code analysis alone.

### Gaps Summary

No gaps found. All 8 must-haves pass automated verification.

**API Limitation (documented, not a gap):** `inferFirstPickFromHistory` returns null when ban counts are symmetric (e.g. 3R+3D at game_state===5 in-game), because the Valve API does not expose first-pick metadata for in-game matches. This is documented in 04-06-SUMMARY.md and 04-CONTEXT.md D-08 as a known API constraint. The code correctly falls back to DraftColumn layout in this case. The DraftTimeline path is reachable during game_state===2 drafts when ≥5 bans have been cast, at which point counts become asymmetric.

---

_Verified: 2026-04-25T00:15:00Z_
_Verifier: Claude (gsd-verifier)_
