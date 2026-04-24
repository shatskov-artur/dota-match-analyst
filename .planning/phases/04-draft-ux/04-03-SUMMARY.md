---
phase: 04-draft-ux
plan: "03"
subsystem: client-utils, client-hooks
tags: [draft, cm-740, turn-inference, tanstack-query-v5, dynamic-refetch, pure-helper, tdd-green]
dependency_graph:
  requires:
    - 04-01 (draftOrder.test.ts + useDraftDetail.test.ts — red contracts now turn GREEN)
    - 04-02 (GET /api/live/draft/:matchId BFF route consumed by fetchDraft())
    - 04-CONTEXT §D-08 (tentative first-pick marker), §D-12 (dynamic refetchInterval), §D-13 (useMatchDetail stays on plain 30s), §D-14 (distinct TQ cache keys)
    - 04-RESEARCH §PF-2 (staleTime strictly below refetchInterval), §PF-5 (non-CM modes fail-closed), §PF-6 (hide indicator when draft complete)
  provides:
    - client/src/utils/draftOrder.ts — pure CM 7.40 turn inference (inferActiveTeam + inferFirstPickFromHistory)
    - client/src/hooks/useDraftDetail.ts — TQ v5 hook with dynamic 5s refetchInterval + exported computeDraftInterval helper
    - useDraftDetail typed return contract for Plan 04 DraftSection: { scoreboard, gameState, activeTeam, action, tentative, isLoading, isError }
  affects:
    - 04-04 (DraftSection / DraftColumn / DraftTurnIndicator consume useDraftDetail output)
tech_stack:
  added: []
  patterns:
    - Pure-helper extraction (computeDraftInterval) so cadence logic can be unit-tested without mounting React — mirrors the groupByLeague precedent in useLiveGames.ts
    - Dynamic refetchInterval callback form (TQ v5): (q: Query<T>) => q.state.data?.game_state === 2 ? 5_000 : false, reading via q.state.data per v5 semantics
    - Two-sequence disambiguation heuristic for first-pick team (walks both Radiant-first and Dire-first prefixes, returns null on ambiguity)
    - Passthrough discipline on response interfaces ([key: string]: unknown on DraftItem/TeamScoreboard/Scoreboard) — mirrors CLAUDE.md §Key Patterns
key_files:
  created:
    - client/src/utils/draftOrder.ts
    - client/src/hooks/useDraftDetail.ts
  modified:
    - client/src/hooks/useMatchDetail.ts
decisions:
  - "draftOrder.ts is pure — zero imports. Exports only inferActiveTeam and inferFirstPickFromHistory. CM_740_RADIANT_FIRST and the mirror() helper are module-private per the plan's explicit 'Do NOT export' directive."
  - "Ban Phase 2 is 5 bans (D R D R D), not 4 — corrected from the initial 04-PATTERNS.md sketch (which said 4) so the per-team totals reconcile to 7 bans + 5 picks each (14 bans + 10 picks = 24 steps). Plan 03 action block flagged this correction explicitly."
  - "CM_740_DIRE_FIRST is derived once at module load from mirror(CM_740_RADIANT_FIRST) — single source of truth for the sequence table, zero risk of the two tables drifting apart."
  - "computeDraftInterval is intentionally minimal: only game_state === 2 returns 5_000; every other value (5, 6, undefined, 0, 99, 1, anything) returns false. Fail-closed matches the D-12 contract and CLAUDE.md §Critical Pitfalls mandate to stop polling on game_state === 6."
  - "staleTime: 4_000 is load-bearing (PF-2) — strictly below the 5_000 refetchInterval so every interval tick actually refetches instead of being silently suppressed by TanStack's freshness check."
  - "No memoization of the inferActiveTeam / inferFirstPickFromHistory calls — both are O(24), polling cadence is 5s, re-render cost is negligible. 04-PATTERNS.md advisory did not call for memoization."
  - "useMatchDetail.ts edit is comment-only — git diff confirmed exactly one line changed inside a JSDoc block, no executable code touched. All 25_000 staleTime / 30_000 refetch / game_state === 6 false / ['live-games'] queryKey regression guards still match exactly once after the edit."
metrics:
  duration: "~4 minutes"
  completed: "2026-04-24T20:47:09Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 1
---

# Phase 4 Plan 3: Client Draft Hook + CM 7.40 Turn Inference Summary

**One-liner:** Client-side draft polling is wired end-to-end — a pure CM 7.40 turn-inference util (`draftOrder.ts`) plus a TanStack Query v5 hook (`useDraftDetail.ts`) with dynamic 5s cadence now turn Plan 04-01's two red test files green (19 tests), and a comment cleanup in `useMatchDetail.ts` records the Phase 4 D-13 split-hook architecture with zero behavioral change.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create `draftOrder.ts` (pure CM 7.40 turn inference) | `d990843` | `client/src/utils/draftOrder.ts` (created, 114 lines) |
| 2 | Create `useDraftDetail.ts` (TQ v5 hook + `computeDraftInterval` helper) | `aa70936` | `client/src/hooks/useDraftDetail.ts` (created, 109 lines) |
| 3 | Clean stale D-13 comment on `useMatchDetail.ts` | `b924801` | `client/src/hooks/useMatchDetail.ts` (modified, 1 line JSDoc) |

## Verify Output Proving Red → Green

### Task 1 — `draftOrder.test.ts`

```
cd client && npx vitest run src/utils/draftOrder.test.ts
 ✓ src/utils/draftOrder.test.ts (13 tests)  5ms
 Test Files  1 passed (1)
      Tests  13 passed (13)
```

Plan 04-01 Task 2 red contract (13 it-blocks) is now GREEN. Every assertion in the Plan 03 `<behavior>` block verified — step-0 both directions, step-1 progression, step-7 Ban Phase 1 → Pick Phase 1 boundary, step-11 Pick Phase 1 → Ban Phase 2 boundary, step-23 final slot (Dire picking), draft-complete null in both first-pick directions, pristine-null, symmetric-null, R-first disambiguation, D-first disambiguation.

### Task 2 — `useDraftDetail.test.ts` (+ regression)

```
cd client && npx vitest run src/hooks/useDraftDetail.test.ts
 ✓ src/hooks/useDraftDetail.test.ts (6 tests)  3ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Plan 04-01 Task 3 red contract (6 it-blocks) is now GREEN: `computeDraftInterval(2) === 5_000`, `(6) === false`, `(5) === false`, `(undefined) === false`, `(1) === false`, `(99) === false`, `(0) === false`.

Regression guard against Task 1:
```
cd client && npx vitest run src/utils/draftOrder.test.ts
 ✓ src/utils/draftOrder.test.ts (13 tests)  5ms
 Tests  13 passed (13)
```

### Task 3 — full client unit suite (no regressions)

```
cd client && npx tsc --noEmit
(exit 0 — no output, no errors)

cd client && npx vitest run src/utils src/hooks
 ✓ src/utils/gameState.test.ts        (10 tests)  6ms
 ✓ src/utils/draftOrder.test.ts       (13 tests)  8ms
 ✓ src/utils/formatDuration.test.ts   ( 6 tests)  5ms
 ✓ src/utils/formatGoldDiff.test.ts   ( 6 tests)  4ms
 ✓ src/hooks/useDraftDetail.test.ts   ( 6 tests)  6ms
 ✓ src/hooks/useLiveGames.test.ts     ( 5 tests)  5ms
 Test Files  6 passed (6)
      Tests  46 passed (46)
```

Zero regressions in Phase 1/2/3 suites; Plan 04-01 Phase 4 contracts flipped green.

## Acceptance-Criteria Greps

| Grep | File | Expected | Actual |
|------|------|----------|--------|
| `^import ` | `client/src/utils/draftOrder.ts` | 0 | 0 ✓ (pure module — no imports) |
| `export function inferActiveTeam\(` | `client/src/utils/draftOrder.ts` | present | present ✓ |
| `export function inferFirstPickFromHistory\(` | `client/src/utils/draftOrder.ts` | present | present ✓ |
| `CM_740_RADIANT_FIRST` | `client/src/utils/draftOrder.ts` | present | present ✓ (module-private) |
| `import \{ useQuery, type Query \} from '@tanstack/react-query'` | `client/src/hooks/useDraftDetail.ts` | 1 | 1 ✓ |
| `import \{ inferActiveTeam, inferFirstPickFromHistory \} from '\.\./utils/draftOrder'` | `client/src/hooks/useDraftDetail.ts` | 1 | 1 ✓ |
| `export function computeDraftInterval\(gameState: number \| undefined\): number \| false` | `client/src/hooks/useDraftDetail.ts` | 1 | 1 ✓ |
| `export function useDraftDetail\(matchId: string \| undefined\)` | `client/src/hooks/useDraftDetail.ts` | 1 | 1 ✓ |
| `queryKey: \['draft', matchId\]` | `client/src/hooks/useDraftDetail.ts` | 1 | 1 ✓ |
| ``/api/live/draft/${matchId}`` | `client/src/hooks/useDraftDetail.ts` | 1 | 1 ✓ |
| `staleTime: 4_000` | `client/src/hooks/useDraftDetail.ts` | 1 | 1 ✓ |
| `refetchInterval: (q: Query<DraftResponse>) => computeDraftInterval(q.state.data?.game_state)` | `client/src/hooks/useDraftDetail.ts` | 1 | 1 ✓ |
| `tentative: firstPick === null && gameState === 2` | `client/src/hooks/useDraftDetail.ts` | 1 | 1 ✓ |
| `^export interface ` | `client/src/hooks/useDraftDetail.ts` | ≥4 | 4 ✓ (DraftItem, TeamScoreboard, Scoreboard, DraftResponse) |
| `Phase 4 upgrades to dynamic` | `client/src/hooks/useMatchDetail.ts` | 0 | 0 ✓ (stale string purged) |
| `Draft-speed 5s polling lives in useDraftDetail` | `client/src/hooks/useMatchDetail.ts` | 1 | 1 ✓ |
| `Phase 4 D-12/D-13` | `client/src/hooks/useMatchDetail.ts` | 1 | 1 ✓ |
| `refetchInterval: matchFromCache\?\.game_state === 6 \? false : 30_000` | `client/src/hooks/useMatchDetail.ts` | 1 | 1 ✓ (logic unchanged) |
| `staleTime: 25_000` | `client/src/hooks/useMatchDetail.ts` | 1 | 1 ✓ (logic unchanged) |
| `queryKey: \['live-games'\]` | `client/src/hooks/useMatchDetail.ts` | 1 | 1 ✓ (logic unchanged) |

## Diff Summary per File

### `client/src/utils/draftOrder.ts` (created, 114 lines)

Pure module (zero imports). Two exports:

```typescript
export function inferActiveTeam(
  counts: { rPicks: number; dPicks: number; rBans: number; dBans: number },
  firstPickTeam: 0 | 1 | null,
): { team: 0 | 1; action: 'pick' | 'ban' } | null

export function inferFirstPickFromHistory(scoreboard: {
  radiant?: { picks?: unknown[]; bans?: unknown[] }
  dire?:    { picks?: unknown[]; bans?: unknown[] }
}): 0 | 1 | null
```

Internals:
- `CM_740_RADIANT_FIRST`: 24-entry readonly table encoding `[team, action]` for each step of the CM 7.40 sequence (Ban1: R D R D R D R → Pick1: R D D R → Ban2: D R D R D → Pick2: D R D R → Ban3: D R → Pick3: R D). Verified vs Liquipedia 2026-04-24.
- `CM_740_DIRE_FIRST = mirror(CM_740_RADIANT_FIRST)`: swaps every team index so the same phase pattern applies when Dire has first pick — single source of truth for the sequence table.
- `inferActiveTeam`: returns null when `firstPickTeam === null` OR `completedSteps >= 24`; otherwise reads `seq[completedSteps]` and returns `{ team, action }`.
- `inferFirstPickFromHistory`: walks both candidate sequences' first `totalSteps` entries, counts expected R/D picks/bans at that prefix, and returns whichever candidate uniquely matches the observed scoreboard counts — or null if both match (symmetric ambiguous) or neither matches (corrupt / non-CM mode, PF-5).

### `client/src/hooks/useDraftDetail.ts` (created, 109 lines)

Imports:
```typescript
import { useQuery, type Query } from '@tanstack/react-query'
import { inferActiveTeam, inferFirstPickFromHistory } from '../utils/draftOrder'
```

Exports: 4 interfaces + 1 pure helper + 1 hook.

```typescript
export interface DraftItem       { hero_id?: number;          [key: string]: unknown }
export interface TeamScoreboard  { picks?: DraftItem[]; bans?: DraftItem[]; [key: string]: unknown }
export interface Scoreboard      { radiant?: TeamScoreboard; dire?: TeamScoreboard; [key: string]: unknown }
export interface DraftResponse   { match_id: number; game_state?: number; scoreboard?: Scoreboard }

export function computeDraftInterval(gameState: number | undefined): number | false

export function useDraftDetail(matchId: string | undefined): {
  scoreboard: Scoreboard | undefined
  gameState:  number | undefined
  activeTeam: 'radiant' | 'dire' | null
  action:     'pick' | 'ban' | null
  tentative:  boolean
  isLoading:  boolean
  isError:    boolean
}
```

TQ v5 config:
- `queryKey: ['draft', matchId]` — distinct from useLiveGames' `['live-games']` per D-14, no cross-contamination.
- `queryFn`: fetches `/api/live/draft/${matchId}` (Plan 04-02 BFF route), throws `BFF error: ${status}` on non-2xx.
- `enabled: !!matchId` — hook disabled when route param missing.
- `refetchInterval: (q: Query<DraftResponse>) => computeDraftInterval(q.state.data?.game_state)` — reads data via `q.state.data` (v5 semantics — callback does NOT get select-transformed view).
- `staleTime: 4_000` — PF-2, strictly below the 5_000 cadence so every interval tick actually refetches.

Derived state:
- `firstPick = scoreboard ? inferFirstPickFromHistory(scoreboard) : null`
- `inferred = inferActiveTeam({rPicks, dPicks, rBans, dBans}, firstPick)`
- `activeTeam`: `'radiant'` / `'dire'` / `null` (mapped from `inferred.team === 0/1/null`)
- `tentative: firstPick === null && gameState === 2` — D-08 best-guess marker, true only when draft live AND first-pick ambiguous.

### `client/src/hooks/useMatchDetail.ts` (modified, 1 line)

One-line JSDoc-only change (confirmed via `git diff --cached`):

```diff
- * CRITICAL (TQ v5): refetchInterval is a plain number — NOT a callback (Phase 4 upgrades to dynamic).
+ * CRITICAL (TQ v5): refetchInterval is a plain number. Draft-speed 5s polling lives in useDraftDetail (Phase 4 D-12/D-13).
```

**useMatchDetail logic is BYTE-IDENTICAL to pre-edit** for all executable code:
- `queryKey: ['live-games']` (line 32, unchanged)
- `queryFn: () => fetch('/api/live/games').then((r) => r.json())` (line 33, unchanged)
- `refetchInterval: matchFromCache?.game_state === 6 ? false : 30_000` (line 35, unchanged)
- `staleTime: 25_000` (line 36, unchanged)
- All other lines 1-15 and 17-65 byte-identical
- File line count: 65 lines before, 65 lines after (±0)

## useDraftDetail Public API (for Plan 04 reference)

Plan 04 DraftSection should consume the hook like this:

```typescript
import { useDraftDetail } from '../hooks/useDraftDetail'

const draft = useDraftDetail(matchId)
// draft.scoreboard  — Scoreboard | undefined (render condition: D-10 — only when present)
// draft.gameState   — number | undefined    (2 = draft, 5 = in-game, 6 = post-game)
// draft.activeTeam  — 'radiant' | 'dire' | null (D-07: null when !draft.gameState === 2)
// draft.action      — 'pick' | 'ban' | null
// draft.tentative   — boolean (D-08 — true when best-guess marker should show)
// draft.isLoading   — boolean
// draft.isError     — boolean
```

DraftSection renders when `draft.scoreboard` is present (D-10). DraftTurnIndicator renders when `draft.gameState === 2` (D-07); otherwise hidden. When `draft.tentative === true`, render the D-08 trailing `?` + reduced-opacity marker.

## Deviations from Plan

None — all three tasks executed exactly as the plan specified.

- Task 1 created `draftOrder.ts` verbatim per the `<action>` block (including the exhaustive 24-step sequence, the `mirror()` helper, both exported functions).
- Task 2 created `useDraftDetail.ts` verbatim per the `<action>` block (queryKey, refetchInterval callback form, staleTime 4_000, all 4 interfaces, `computeDraftInterval` helper with minimal game_state===2 branch, `tentative` logic).
- Task 3 swapped exactly one JSDoc line on `useMatchDetail.ts:16` and nothing else — confirmed via `git diff --cached`.
- Auto-fix rules 1-3 did not trigger: no bugs, no missing critical functionality, no blocking issues.
- Rule 4 did not trigger: no architectural escalation needed.

## Authentication Gates

None — client-side pure logic + hook, no auth surface introduced.

## Known Stubs

None — `useDraftDetail` is a fully wired hook end-to-end. It fetches the real BFF route created in Plan 04-02, derives real turn-state from the real `inferActiveTeam`/`inferFirstPickFromHistory` utils, and returns a typed result ready for Plan 04 UI consumption. No hardcoded empty values, no placeholders.

## Threat Flags

None — Plan 03 ships:

| Surface | Coverage |
|---------|----------|
| BFF response trust (T-04-T-02) | `fetchDraft` checks `res.ok` before `res.json()`; throws generic `BFF error: ${status}` on non-2xx, surfaced as `isError`. Mitigation present. |
| Turn inference on bad counts (T-04-T-03) | `inferActiveTeam` returns null when `completedSteps >= 24` OR `firstPickTeam === null`. `inferFirstPickFromHistory` returns null on corrupt payload. Both fail-closed. |
| Error disclosure (T-04-I-03) | `fetchDraft` error message exposes only HTTP status — matches existing `fetchLiveGames` convention; no URL, body, or headers leaked. |
| Upstream quota drain (T-04-D-03) | `computeDraftInterval` returns `false` for game_state 5, 6, undefined, and anything else — belt-and-suspenders vs quota drain per CLAUDE.md §Critical Pitfalls. |
| Silent refetch skip (T-04-D-04) | Hardcoded `staleTime: 4_000` (< 5_000 refetchInterval), verified by grep in acceptance criteria. |

No new threat surface introduced beyond the plan's STRIDE register.

## Self-Check: PASSED

- `client/src/utils/draftOrder.ts` — FOUND on disk (114 lines, no imports, exports both functions)
- `client/src/hooks/useDraftDetail.ts` — FOUND on disk (109 lines, imports both draftOrder functions, exports 4 interfaces + computeDraftInterval + useDraftDetail)
- `client/src/hooks/useMatchDetail.ts` — FOUND on disk (65 lines, stale string purged, logic unchanged)
- Commit `d990843` (Task 1) — FOUND in `git log --oneline -5`
- Commit `aa70936` (Task 2) — FOUND in `git log --oneline -5`
- Commit `b924801` (Task 3) — FOUND in `git log --oneline -5`
- `cd client && npx tsc --noEmit` — exits 0
- `cd client && npx vitest run src/utils src/hooks` — 6 test files, 46 tests, all PASS
- All 20 acceptance-criteria grep guards checked above, all match expected counts
