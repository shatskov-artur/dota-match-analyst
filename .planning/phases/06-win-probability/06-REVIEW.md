---
phase: 06-win-probability
reviewed: 2026-04-27T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - client/src/components/WinProbBar.tsx
  - client/src/hooks/useWinProbability.ts
  - client/src/pages/MatchPage.tsx
  - server/src/routes/live.ts
  - server/src/services/winProbHeuristic.test.ts
  - server/src/services/winProbHeuristic.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-04-27T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 06 introduces a three-bar win probability panel (Stratz, Gold, Est.) backed by a heuristic service (`winProbHeuristic.ts`) and a new `/api/live/winprob/:matchId` endpoint. The architecture is sound: heuristics degrade gracefully to 0.5 when data is absent, Stratz is always optional via `Promise.allSettled`, polling stops at game_state === 6, and inputs are validated before touching any cache or upstream.

Three warnings were found:

1. A default-value fallback in `MatchPage.tsx` causes the `WinProbBar` to render with misleading 50/50 probabilities before the first fetch completes, because `winProb.data` is `undefined` during the loading state and `?? 0.5` supplies a confident-looking neutral value.
2. In `winProbHeuristic.ts`, calling `buildingDecoder` and immediately discarding the result (`void buildings`) is redundant dead code — the function is invoked only for its side-effect-free return value, then thrown away. The actual bitmask math is re-done below with raw bit operations.
3. In the `/winprob/:matchId` route, `game?.game_state` may be undefined even when `hasPlayers` is true (Valve omits `game_state` at top level in some payloads). The fallback `?? (hasPlayers ? 5 : null)` is correct per the pattern established in `/games`, but the returned `null` is passed to `computeWinProbInterval` which expects `number | undefined`, not `number | null`. The hook defensively converts `null → undefined` via `?? undefined`, which works, but the type contract between server and client is inconsistent.

Three informational items were also noted.

## Warnings

### WR-01: WinProbBar shown with fake 50/50 values during loading

**File:** `client/src/pages/MatchPage.tsx:74-79`

**Issue:** `winProb.data` is `undefined` while the first fetch is in-flight. The fallbacks `?? 0.5` mean that when both `match?.game_state === 5` and `match?.duration > 300` are already known (from a prior `useMatchDetail` fetch), `WinProbBar` renders immediately with gold=0.5, estimate=0.5, showing two confident-looking bars before any heuristic has been computed. A user sees "Gold 50% / Est. 50%" as if real data were present.

**Fix:** Gate the `WinProbBar` on data being available, or pass `undefined` so the bar's own gating logic can handle it:

```tsx
<WinProbBar
  stratz={winProb.data?.stratz ?? null}
  gold={winProb.data?.gold ?? undefined}       // undefined → bar handles gracefully
  estimate={winProb.data?.estimate ?? undefined}
  gameDuration={match?.duration}
  gameState={match?.game_state}
/>
```

And update `WinProbBarProps` to accept `number | undefined` for `gold` and `estimate`, returning `null` from the component when either is undefined. Alternatively, simply suppress the panel until `winProb.data` is defined:

```tsx
{winProb.data && (
  <WinProbBar
    stratz={winProb.data.stratz}
    gold={winProb.data.gold}
    estimate={winProb.data.estimate}
    gameDuration={match?.duration}
    gameState={match?.game_state}
  />
)}
```

---

### WR-02: Dead `buildingDecoder` call — result is discarded immediately

**File:** `server/src/services/winProbHeuristic.ts:73-74`

**Issue:** `buildingDecoder` is called and its return value is immediately voided:

```ts
const buildings = buildingDecoder(towerState, barracksState)
void buildings
```

`buildingDecoder` has no side effects — it is a pure function. The call accomplishes nothing. The actual tower and rax bitmasks are computed below using raw bit operations (lines 77-84) that do not use `buildings` at all. This is confusing dead code that implies a validation purpose that doesn't exist.

**Fix:** Remove the dead call entirely. If the intent was to validate inputs via `buildingDecoder`, either use its structured output or document why raw bit operations are preferred:

```ts
// Remove lines 72-74:
// const buildings = buildingDecoder(towerState, barracksState)
// void buildings

// The raw popcount is correct; no wrapper call needed.
const radiantTowerBits = towerState !== undefined ? towerState & 0x7ff : 0x7ff
```

---

### WR-03: Type mismatch — server returns `gameState: number | null`, client converts `null → undefined` implicitly

**File:** `client/src/hooks/useWinProbability.ts:50-54` and `server/src/routes/live.ts:357`

**Issue:** The server `WinProbResponse` shape (as documented in the hook's `WinProbResponse` interface, line 8) declares `gameState: number | null`. The route at `live.ts:357` can return `null` for `gameState`. The `refetchInterval` callback converts `null → undefined` via `q.state.data?.gameState ?? undefined` (line 52), which works, but `computeWinProbInterval` (line 21-28) is typed to accept `number | undefined`, not `number | null`.

If the server contract changes and starts returning `gameState: null` without the client-side `?? undefined` coercion (e.g., if the callback is refactored), `null` would flow through. `null === 6` is `false` and `null === 5` is `false`, so polling would silently stop (`return false`) rather than continuing at 30s cadence — causing a subtle polling failure, not a crash.

**Fix:** Either align the server contract to return `number | undefined` (omit the field rather than null), or make `computeWinProbInterval` accept `number | null | undefined`:

```ts
export function computeWinProbInterval(
  gameState: number | null | undefined,
  duration: number | null | undefined,
): number | false {
  if (gameState === 6) return false
  if (gameState === 5 && (duration ?? 0) > 300) return 30_000
  return false
}
```

This makes the actual null-safety explicit and eliminates the hidden `?? undefined` requirement at the call site.

---

## Info

### IN-01: `window.matchMedia` called on every render in `WinProbBar`

**File:** `client/src/components/WinProbBar.tsx:79-81`

**Issue:** `window.matchMedia('(prefers-reduced-motion: reduce)').matches` is evaluated on every render. The `matchMedia` call is not expensive, but it runs unconditionally inside a render function (not cached in a ref or hook), which is atypical for React. It also re-evaluates even when the user preference cannot change between renders.

**Fix:** Move the check outside the component or memoize it. Since this is a functional component, the minimal change is to move the expression to module scope (it only changes if the user changes OS settings, which React will not observe anyway):

```tsx
const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function WinProbBar(...) {
  // prefersReducedMotion is already resolved
```

---

### IN-02: Unused `type Query` import in `useWinProbability.ts`

**File:** `client/src/hooks/useWinProbability.ts:1`

**Issue:** `type Query` is imported from `@tanstack/react-query` but used only in the inline annotation `(q: Query<WinProbResponse>)`. The import is needed, so this is not a true dead import — however, using `import type` is the correct form for a type-only import in TypeScript (the current import mixes value and type on one line). If `useQuery` is ever tree-shaken or the import is refactored, forgetting the `type` modifier can cause subtle CJS/ESM interop issues.

**Fix:**

```ts
import { useQuery } from '@tanstack/react-query'
import type { Query } from '@tanstack/react-query'
```

Or the combined form that TypeScript 4.5+ supports:

```ts
import { useQuery, type Query } from '@tanstack/react-query'
```

The current code already uses this combined form, so this is advisory only — confirm that the project's `verbatimModuleSyntax` or `isolatedModules` tsconfig option is satisfied.

---

### IN-03: Test comment "RED state" is stale

**File:** `server/src/services/winProbHeuristic.test.ts:21-22`

**Issue:** Lines 21-22 contain:

```ts
// RED state: ./winProbHeuristic.js does not exist yet — all imports will fail.
// After Task 2 (GREEN): all assertions must pass.
```

The implementation now exists and all tests pass. This comment is scaffolding that was never removed and misleads readers into thinking the file is in a broken state.

**Fix:** Remove or replace the comment:

```ts
// Heuristic unit tests — computeGoldWinProb, computeEstWinProb, extractScoreboardInputs
```

---

_Reviewed: 2026-04-27T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
