---
phase: 03-match-core
verified: 2026-04-24T20:35:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Navigate from home page to /match/:matchId and confirm full match screen renders"
    expected: "Score header with kill scores and gold diff, 10-player hero grid with portraits, buildings schematic below grid"
    why_human: "Visual rendering of hero portraits (CDN images), opacity overlay on dead heroes, and overall layout cannot be verified programmatically"
  - test: "Confirm gold diff sign and Unicode minus: open a match where Dire is leading in net worth"
    expected: "Center of ScoreHeader shows '−X,XXX' in red (#ef4444) with Unicode minus sign U+2212, not an ASCII hyphen"
    why_human: "Character encoding difference (U+2212 vs U+002D) is invisible in source but perceptible visually and to screen readers"
  - test: "Confirm series score format in ScoreHeader: look for '1–0 · Bo3' or similar"
    expected: "En-dash U+2013 between win counts, dot separator, and series label (Bo1/Bo3/Bo5)"
    why_human: "En-dash vs hyphen is a display concern, not caught programmatically"
  - test: "Confirm dead hero state: if a hero has respawn_timer > 0, portrait is at 0.3 opacity with '{N}s' text below"
    expected: "Hero portrait is visibly dimmed, respawn countdown number is visible in #585858 below the portrait"
    why_human: "Opacity and overlay positioning require visual inspection of a live match with at least one dead hero"
  - test: "Confirm BuildingsSection hidden during draft (game_state === 2) and visible in-game (game_state === 5)"
    expected: "Buildings schematic is absent when match is in draft; appears with lane dots when match is live"
    why_human: "Depends on live data having a match in draft state — cannot mock without a running server"
  - test: "Confirm direct URL navigation to /match/99999999 redirects to home page"
    expected: "After brief loading, browser is redirected to / with no error page or crash"
    why_human: "Requires running app and browser navigation; cannot verify the redirect timing with grep"
  - test: "Confirm delay disclosure label in ScoreHeader center column"
    expected: "Text reads '~120s delay' (or '~{N}s delay' when stream_delay_s is present) below the gold diff value"
    why_human: "Content depends on live API data; requires browser verification"
---

# Phase 3: Match Core Verification Report

**Phase Goal:** A user opens a live match and instantly understands the in-game state — score, gold, heroes, buildings, series context — without needing any other tab.
**Verified:** 2026-04-24T20:35:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User sees real-time Radiant vs Dire kill score and net-worth gold difference updating every 30s (MATCH-01) | ✓ VERIFIED | ScoreHeader.tsx renders `match.radiant_score` and `match.dire_score` at text-[52px]. `formatGoldDiff` computes diff from `players?.filter(team===0/1).reduce(net_worth)`. useMatchDetail polls with `refetchInterval: 30_000` (stops at game_state===6). |
| 2 | User sees 5v5 hero grid with hero portrait, alive/dead state, and respawn countdown (MATCH-02) | ✓ VERIFIED | PlayerRow.tsx renders `heroInfo.portrait` in `<img>` with `opacity: isDead ? 0.3 : 1`. When `isDead`, renders `{player.respawn_timer}s` below portrait. HeroPlayerGrid.tsx passes 5 radiantPlayers + 5 direPlayers from useMatchDetail hook. |
| 3 | User sees tower and barracks status per lane for both sides (MATCH-03) | ✓ VERIFIED | BuildingsSection.tsx renders RADIANT_ORDER ['tier1','tier2','tier3','meleeRax','rangedRax'] and mirrored DIRE_ORDER per lane. buildingDecoder called with `match?.tower_state` + `match?.barracks_state` in useMatchDetail. MatchPage gates BuildingsSection behind `!buildings.unavailable`. |
| 4 | User sees current series score and delay disclosure (MATCH-04) | ✓ VERIFIED | ScoreHeader.tsx: `seriesScore` = `${radiantWins}–${direWins}${seriesLabel ? ` · ${seriesLabel}` : ''}`. `delayLabel` = `~${match.stream_delay_s}s delay` or `~120s delay` fallback. Both rendered in component JSX. |
| 5 | User sees K/D/A and net worth for all 10 players (MATCH-05) | ✓ VERIFIED | PlayerRow.tsx renders `player.kills / player.death / player.assists` (using correct singular `death` field) and `player.net_worth.toLocaleString()`. HeroPlayerGrid maps radiantPlayers + direPlayers arrays. |

**Score:** 5/5 truths verified

**Note on MATCH-03 ROADMAP wording:** ROADMAP.md SC3 says "decoded from `building_state`" but the actual implementation uses `tower_state` and `barracks_state` — the correct field names per `valve.ts` lines 46-47 and per CONTEXT.md D-09/D-10. `building_state` is a legacy alternate field name noted in `valve.ts` line 48. The implementation is architecturally correct; the ROADMAP has a stale field name in its prose.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `client/src/utils/heroMapper.ts` | Browser-safe hero ID mapping via Vite JSON import | ✓ VERIFIED | Exports `heroMapper(id: number): HeroInfo \| null` and `HeroInfo`. Uses `import heroes from '../../../shared/heroes.json'`. No `createRequire` in import statement. |
| `client/src/utils/formatGoldDiff.ts` | Gold diff formatter with color | ✓ VERIFIED | Exports `GoldDiffResult` type and `formatGoldDiff`. Uses `Intl.NumberFormat('en-US')` for locale-safe comma formatting (not `toLocaleString()`). Unicode minus U+2212 confirmed in source. |
| `client/src/utils/formatGoldDiff.test.ts` | 6 vitest unit tests all passing | ✓ VERIFIED | 6 tests confirmed passing in vitest run (27 total tests, 4 files, all pass). Includes charCodeAt(0) === 0x2212 check for Unicode minus. |
| `server/src/schemas/valve.ts` | PlayerSchema with level/gpm/xpm/lh/dn as optional | ✓ VERIFIED | Contains `level: z.number().optional()`, `gpm: z.number().optional()`, `xpm: z.number().optional()`, `lh: z.number().optional()`, `dn: z.number().optional()`. `.passthrough()` preserved. |
| `client/src/hooks/useMatchDetail.ts` | TQ v5 hook reading ['live-games'] cache | ✓ VERIFIED | `getQueryData<LiveGamesResponse>(['live-games'])` for sync read. `refetchInterval: matchFromCache?.game_state === 6 ? false : 30_000`. Redirect guard: `!query.isLoading && query.isFetched && !match`. No `enabled:` flag. No `onSuccess`. |
| `client/src/components/SkeletonPlayerRow.tsx` | Skeleton with skshimmer animation, 3 bars | ✓ VERIFIED | `skshimmer 2.4s ease-in-out infinite` with stagger delays. Three bars (w-12, flex-1, w-32). `minHeight: 52`, `borderColor: '#1e1e1e'`. |
| `client/src/components/PlayerRow.tsx` | Player row with portrait, K/D/A, NW, optional stats | ✓ VERIFIED | Imports from `'../utils/heroMapper'` (relative, not @shared). `opacity: isDead ? 0.3 : 1`. `player.death` (singular). `isDraftSlot = player.hero_id === undefined`. hasGpm/hasXpm/hasLhDn conditional columns. No CSS `filter:` property. |
| `client/src/components/ScoreHeader.tsx` | Score header with gold diff, series, delay | ✓ VERIFIED | `formatGoldDiff` imported and applied. `getSeriesLabel` and `StatusTag` used. `radiantNW` from `players?.filter(p.team===0)`. `~${match.stream_delay_s}s delay` with `~120s delay` fallback. `text-[52px]` kill scores (larger than plan spec `text-[28px]` — improved in commit 394b2f7 for contrast). |
| `client/src/components/HeroPlayerGrid.tsx` | Two-group player grid with optional column detection | ✓ VERIFIED | `allPlayers.some((p) => (p as any).gpm !== undefined)` for hasGpm. `isLoading` renders SkeletonPlayerRow x10. Radiant label `color: '#4ade80'`, Dire `color: '#ef4444'`. |
| `client/src/components/BuildingsSection.tsx` | Lane schematic, Radiant/Dire dot order | ✓ VERIFIED | `RADIANT_ORDER` starts with `'tier1'`. `DIRE_ORDER` starts with `'rangedRax'`. `BuildingDot` with `opacity: standing ? 1 : 0.25`. Imports from `'@shared/buildingDecoder'`. |
| `client/src/pages/MatchPage.tsx` | Match detail page replacing MatchPlaceholder | ✓ VERIFIED | `import { useMatchDetail }`, `import ScoreHeader`, `import HeroPlayerGrid`, `import BuildingsSection`. `!buildings.unavailable` D-10 guard. `mt-12` section spacing. No `MatchPlaceholder` or `DEV PLACEHOLDER` text. |
| `client/src/App.tsx` | Routes /match/:matchId to MatchPage | ✓ VERIFIED | `import MatchPage from './pages/MatchPage'`. Route: `<Route path="/match/:matchId" element={<MatchPage />} />`. No `MatchPlaceholder` import. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `heroMapper.ts` | `shared/heroes.json` | Vite JSON import | ✓ WIRED | `import heroes from '../../../shared/heroes.json'` confirmed in source |
| `PlayerRow.tsx` | `client/src/utils/heroMapper.ts` | relative import | ✓ WIRED | `import { heroMapper } from '../utils/heroMapper'` confirmed — NOT @shared |
| `ScoreHeader.tsx` | `client/src/utils/formatGoldDiff.ts` | relative import | ✓ WIRED | `import { formatGoldDiff } from '../utils/formatGoldDiff'` confirmed |
| `useMatchDetail.ts` | `['live-games']` TQ cache | `getQueryData` | ✓ WIRED | `queryClient.getQueryData<LiveGamesResponse>(['live-games'])` confirmed |
| `useMatchDetail.ts` | `shared/buildingDecoder` | `@shared` alias | ✓ WIRED | `import { buildingDecoder } from '@shared/buildingDecoder'` confirmed; called with `match?.tower_state` not `building_state` |
| `App.tsx` | `MatchPage.tsx` | import + Route | ✓ WIRED | `import MatchPage from './pages/MatchPage'` and `element={<MatchPage />}` confirmed |
| `MatchPage.tsx` | `useMatchDetail.ts` | named import | ✓ WIRED | `import { useMatchDetail } from '../hooks/useMatchDetail'` confirmed |
| `BuildingsSection.tsx` | `shared/buildingDecoder.ts` | `@shared` type import | ✓ WIRED | `import type { BuildingState, LaneBuildings } from '@shared/buildingDecoder'` confirmed |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `ScoreHeader.tsx` | `match.radiant_score`, `match.dire_score`, `players` | `useMatchDetail` → `['live-games']` TQ cache → `GET /api/live/games` → Valve API | Yes — live API fetch, zod-validated | ✓ FLOWING |
| `PlayerRow.tsx` | `player.kills`, `player.death`, `player.assists`, `player.net_worth`, `player.hero_id`, `player.respawn_timer` | Props from `HeroPlayerGrid` ← `useMatchDetail` ← TQ cache | Yes — real player objects from Valve response | ✓ FLOWING |
| `BuildingsSection.tsx` | `buildings.radiant[lane][key]`, `buildings.dire[lane][key]` | `buildingDecoder(match?.tower_state, match?.barracks_state)` in `useMatchDetail` | Yes — decoded from real bitmask fields | ✓ FLOWING |
| `HeroPlayerGrid.tsx` | `radiantPlayers`, `direPlayers` | `useMatchDetail` returns `match?.players?.filter(team===0/1)` | Yes — filtered from live Valve player array | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| vitest suite passes | `npx vitest run` in client/ | 27 tests, 4 files, all passed | ✓ PASS |
| heroMapper returns null for id 0 | Source check: `(heroes as Record<string, HeroInfo>)[String(0)] ?? null` | '0' not a valid hero key → returns null | ✓ PASS |
| formatGoldDiff Unicode minus | Source: `fmt.format(Math.abs(diff))` prefixed with '−' (U+2212) | Confirmed by charCodeAt test passing | ✓ PASS |
| App.tsx routes to MatchPage (not MatchPlaceholder) | Grep `match/:matchId` in App.tsx | `element={<MatchPage />}` confirmed | ✓ PASS |
| BuildingsSection hidden when unavailable | `!buildings.unavailable` gate in MatchPage | Line 66 confirmed | ✓ PASS |
| Browser visual rendering | Requires running dev server | Cannot verify without browser | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MATCH-01 | 03-01, 03-02, 03-03, 03-04 | Kill score and net-worth gold difference in real time | ✓ SATISFIED | `ScoreHeader` renders kill scores + `formatGoldDiff`; `useMatchDetail` polls every 30s |
| MATCH-02 | 03-01, 03-02, 03-03, 03-04 | Hero portrait with alive/dead state and respawn countdown | ✓ SATISFIED | `PlayerRow` renders portrait with `opacity: isDead ? 0.3 : 1` and `{respawn_timer}s` countdown |
| MATCH-03 | 03-02, 03-04 | Tower and barracks state per lane for both sides | ✓ SATISFIED | `BuildingsSection` renders 3-lane schematic; gated by `!buildings.unavailable`; `buildingDecoder` called with `tower_state` |
| MATCH-04 | 03-03, 03-04 | Current series score and delay disclosure | ✓ SATISFIED | `ScoreHeader` renders `seriesScore` (e.g. "1–0 · Bo3") and `delayLabel` (`~120s delay` or `~{N}s delay`) |
| MATCH-05 | 03-01, 03-02, 03-03, 03-04 | K/D/A and net worth for all 10 players | ✓ SATISFIED | `PlayerRow` renders `kills/death/assists/net_worth` (singular `death` field correct); `HeroPlayerGrid` maps all 10 players |

**Coverage:** 5/5 MATCH-* requirements addressed. No orphaned requirements (MATCH-06 is deferred to Phase 6 per roadmap — not in scope for Phase 3).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `client/src/pages/MatchPlaceholder.tsx` | 43 | `DEV PLACEHOLDER` comment in orphaned file | ℹ️ Info | File is no longer imported anywhere — App.tsx routes to MatchPage instead. Orphaned artifact, not a blocker. |

No blockers found in Phase 3 implementation files. No TODO/FIXME/placeholder text in any delivered component, hook, or utility.

### Human Verification Required

Plan 04 included a `checkpoint:human-verify` gate (Task 3) that was explicitly left pending. The SUMMARY documents "Task 3 is a checkpoint:human-verify gate. The automated work is complete. Human verification of the match screen in browser is pending."

#### 1. Full Match Screen Visual Render

**Test:** Start dev server (`npm run dev`), open http://localhost:5173, click any live match row to navigate to `/match/:matchId`
**Expected:** Page shows: (a) "← Back to matches" link, (b) H1 match title "Team A vs Team B", (c) ScoreHeader with Radiant kill score left in green, Dire kill score right in red, gold diff in center, delay label and series score below team names, (d) HeroPlayerGrid with Radiant group header (green), 5 player rows with portraits/stats, Dire group header (red), 5 player rows, (e) BuildingsSection with 3-lane schematic if match is in-game
**Why human:** Visual layout, color contrast, portrait image loading from Valve CDN, and overall screen composition cannot be verified programmatically

#### 2. Gold Diff Unicode Minus Sign

**Test:** On a live match where Dire has higher total net worth, check the center of ScoreHeader
**Expected:** Diff shows '−X,XXX' with the Unicode minus sign (−, U+2212), NOT a hyphen-minus (-, U+002D) — visually identical but semantically different
**Why human:** The charCodeAt test in vitest passes (confirming the source uses U+2212), but browser rendering and font fallback behavior for this character needs visual confirmation

#### 3. Dead Hero State Display

**Test:** During an in-game match where at least one hero is dead (respawn_timer > 0)
**Expected:** That hero's portrait is visibly dimmed (opacity 0.3 — noticeably darker than other heroes), and the respawn countdown "{N}s" text appears below the portrait in gray
**Why human:** Requires a live match with a dead hero; portrait opacity difference requires visual comparison

#### 4. BuildingsSection Draft vs In-Game

**Test:** Compare match screen during draft phase (game_state === 2) versus in-game (game_state === 5)
**Expected:** Buildings section is completely absent during draft, appears below HeroPlayerGrid when in-game
**Why human:** Requires observing both game states with live data

#### 5. Direct URL Navigation Redirect

**Test:** Navigate directly to `/match/99999999` (nonexistent match ID)
**Expected:** Brief loading state, then automatic redirect to home page `/` — no error page, no crash
**Why human:** Requires running browser navigation to observe the redirect; the `isFetched` guard timing is critical

#### 6. Delay Disclosure Label

**Test:** Check the center column of ScoreHeader (below gold diff value)
**Expected:** Text reads "~120s delay" (fallback) or "~{N}s delay" when `stream_delay_s` is present in API response
**Why human:** Requires live API data to confirm the `stream_delay_s` field is populated and displayed correctly

#### 7. Series Score Format

**Test:** On a Bo3 match with 1 win for Radiant, check the series score text under team name
**Expected:** "1–0 · Bo3" with en-dash (U+2013) between win counts
**Why human:** En-dash vs hyphen is a typography concern requiring visual inspection

---

### Gaps Summary

No gaps blocking goal achievement. All 5 observable truths are verified with substantial code evidence:

- All 12 required artifacts exist, are substantive (not stubs), and are wired into the data flow
- All 8 key links are connected
- vitest suite: 27/27 tests pass
- Data flows from Valve API through zod validation → TQ cache → useMatchDetail hook → all presentation components
- Requirements MATCH-01 through MATCH-05 are fully addressed

The `human_needed` status reflects Plan 04's explicit pending human checkpoint (Task 3), not any detected deficiency. The automated verification is complete and clean. Proceed to browser verification using the checklist in Plan 04 Task 3 and the items above.

---

_Verified: 2026-04-24T20:35:00Z_
_Verifier: Claude (gsd-verifier)_
