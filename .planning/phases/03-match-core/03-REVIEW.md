---
phase: 03-match-core
reviewed: 2026-04-25T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - client/src/utils/heroMapper.ts
  - client/src/utils/formatGoldDiff.ts
  - client/src/utils/formatGoldDiff.test.ts
  - client/src/hooks/useMatchDetail.ts
  - client/src/components/SkeletonPlayerRow.tsx
  - client/src/components/PlayerRow.tsx
  - client/src/components/ScoreHeader.tsx
  - client/src/components/HeroPlayerGrid.tsx
  - client/src/components/BuildingsSection.tsx
  - client/src/pages/MatchPage.tsx
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-04-25T00:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Phase 3 (Match Core) is in solid shape overall. The fundamental data-flow is correct — the `buildingDecoder` is called with the right field name (`tower_state`, not `building_state`), the `building_state === undefined` guard is respected, hidden profiles are short-circuited, and the poll-stop on `game_state === 6` is implemented. No critical bugs were found.

There are five warnings: two relate to silent error swallowing in the data-fetch path and an unguarded `r.json()` on HTTP errors; one is a logic edge-case in the redirect guard that can briefly navigate away during a refetch; one is a React performance anti-pattern (inline component defined inside render); and one is a mismatched column header in the Dire player group (headers rendered only for Radiant, then silently omitted for Dire).

Four informational items round out minor quality issues: a `void isHidden` suppression that masks an untested contract, skeleton shimmer heights that are effectively invisible (`h-[1px]`), magic `stream_delay_s` default hard-coded in a UI component, and missing `key` stability for player rows.

---

## Warnings

### WR-01: `useMatchDetail` — `fetch` response not checked for HTTP errors before `.json()`

**File:** `client/src/hooks/useMatchDetail.ts:33`

**Issue:** The `queryFn` calls `fetch('/api/live/games').then((r) => r.json())` without checking `r.ok`. If the backend returns a 4xx/5xx response, `.json()` still parses the error body (or throws a SyntaxError on non-JSON bodies). TanStack Query will not mark the query as errored, so the component receives malformed data silently. This can cause the `games` array to be absent/undefined, and the redirect effect at line 44 will fire immediately after a transient 500, navigating users away from a match they're watching.

**Fix:**
```ts
queryFn: () =>
  fetch('/api/live/games').then((r) => {
    if (!r.ok) throw new Error(`live-games fetch failed: ${r.status}`)
    return r.json()
  }),
```

---

### WR-02: `useMatchDetail` — redirect fires during background refetch when `match` momentarily resolves to `undefined`

**File:** `client/src/hooks/useMatchDetail.ts:43-47`

**Issue:** The effect condition is `!query.isLoading && query.isFetched && !match`. In TanStack Query v5, `isLoading` is `false` during a background refetch (it is only `true` on the very first fetch when there is no cached data). If a background refetch momentarily returns a payload where `games` is empty or the match ID is absent (e.g., a 200 with an empty list or a parse error), the redirect fires while the user is actively watching the match. The correct guard uses `!query.isFetching` or checks `query.isSuccess` before concluding the match is gone.

**Fix:**
```ts
useEffect(() => {
  // isFetching covers both initial load and background refetches.
  // Only redirect when we have settled data (not loading) and the match is truly absent.
  if (!query.isFetching && query.isSuccess && !match) {
    navigate('/')
  }
}, [query.isFetching, query.isSuccess, match, navigate])
```

---

### WR-03: `HeroPlayerGrid` — `ColHeaders` defined as an inline component inside the parent render function

**File:** `client/src/components/HeroPlayerGrid.tsx:26-49`

**Issue:** `ColHeaders` is declared as a `const` arrow function component inside the body of `HeroPlayerGrid`. React treats it as a new component type on every render, causing it to unmount and remount on every parent re-render. This defeats React's reconciler, produces unnecessary DOM churn, and will cause subtle focus/animation resets. The Dire player group also has no `<ColHeaders />` call (line 74), making column header alignment inconsistent between the two groups.

**Fix:** Move `ColHeaders` outside `HeroPlayerGrid` as a named module-level component and pass `hasGpm`, `hasXpm`, `hasLhDn` as props. Add a second `<ColHeaders />` call above the Dire player list, the same as is done for Radiant (line 66):

```tsx
// module level, outside HeroPlayerGrid
function ColHeaders({ hasGpm, hasXpm, hasLhDn }: Pick<HeroPlayerGridProps, 'hasGpm' | 'hasXpm' | 'hasLhDn'>) {
  // ... same JSX
}

// inside HeroPlayerGrid render, for Dire group:
<ColHeaders hasGpm={hasGpm} hasXpm={hasXpm} hasLhDn={hasLhDn} />
{direPlayers.map((p, i) => ...)}
```

---

### WR-04: `HeroPlayerGrid` — `as any` cast to detect optional columns defeats type safety

**File:** `client/src/components/HeroPlayerGrid.tsx:21-23`

**Issue:** The type cast `(p as any).gpm` is used to work around the fact that the inline prop type does not include `gpm`, `xpm`, or `lh`. The inline player object type on lines 5-14 already declares `gpm?: number`, `xpm?: number`, and `lh?: number`, so the `as any` cast is unnecessary and masks the type definition. If the interface drifts (e.g., a field is renamed), TypeScript will no longer catch it.

**Fix:** Remove the `as any` casts. The declared interface already includes these fields:
```ts
const hasGpm = allPlayers.some((p) => p.gpm !== undefined)
const hasXpm = allPlayers.some((p) => p.xpm !== undefined)
const hasLhDn = allPlayers.some((p) => p.lh !== undefined)
```

---

### WR-05: `PlayerRow` — `lh` present but `dn` silently defaults to `0` when absent

**File:** `client/src/components/PlayerRow.tsx:114`

**Issue:** The LH/DN column renders `${player.lh} / ${player.dn ?? 0}`. When `dn` is absent (e.g., during early game or a draft phase where the field is not yet streamed), it silently shows `0` rather than `—`. This is misleading: a `0` deny count looks like a real value, not missing data. This is inconsistent with the rest of the component where absent stats render as `'—'`.

**Fix:**
```tsx
{isDraftSlot
  ? '—'
  : player.lh !== undefined
    ? `${player.lh} / ${player.dn !== undefined ? player.dn : '—'}`
    : '—'}
```

---

## Info

### IN-01: `PlayerRow` — `void isHidden` suppresses a dead code warning without enforcing the contract

**File:** `client/src/components/PlayerRow.tsx:35`

**Issue:** `isHidden` is computed and then immediately voided (`void isHidden`). The comment says "rendering is unchanged (silently skip missing data)" but this means the hidden-profile guard has zero effect — the component renders exactly the same for hidden and non-hidden profiles. If the intent is to never fetch additional stats, that is enforced upstream (at the aggregator), but the local variable declaration and void are pure noise that can confuse reviewers about intent. If the intent is to eventually grey-out or mark hidden profiles differently, the `void` should be removed and the variable used in rendering.

**Fix:** Either remove `isHidden` and the `void` entirely (if the guard is only needed upstream), or add a visible use such as a tooltip or a dimmed name style.

---

### IN-02: `SkeletonPlayerRow` — shimmer bars have height `h-[1px]` and are effectively invisible

**File:** `client/src/components/SkeletonPlayerRow.tsx:9, 17, 25`

**Issue:** All three shimmer divs use `h-[1px]`. Combined with the `opacity: 0.4` animation floor, the shimmer bars are a 1px hairline at 40% opacity — essentially invisible against a dark background. The `minHeight: 52` on the container row comes from its flex parent but the shimmer elements themselves have no visible height. Typical skeleton loaders use `h-3` or `h-4` to be legible.

**Fix:** Change `h-[1px]` to `h-3` (12px) on all three shimmer divs to match the approximate text height in `PlayerRow`.

---

### IN-03: `ScoreHeader` — `~120s delay` fallback hard-coded in UI component

**File:** `client/src/components/ScoreHeader.tsx:29-32`

**Issue:** The default delay label `'~120s delay'` is hard-coded in the component body. This is a domain constant (Valve's standard stream delay is 120 s) that belongs in a shared constants file or at minimum a named constant, not inline in JSX logic. If the default changes, there is no central place to update it.

**Fix:**
```ts
// top of file or in a constants module
const DEFAULT_STREAM_DELAY_S = 120

// in component:
const delayLabel = match.stream_delay_s !== undefined
  ? `~${match.stream_delay_s}s delay`
  : `~${DEFAULT_STREAM_DELAY_S}s delay`
```

---

### IN-04: `HeroPlayerGrid` — index used as `key` for player rows

**File:** `client/src/components/HeroPlayerGrid.tsx:68, 75`

**Issue:** Both Radiant and Dire player lists use array index as the React `key` (`key={i}`). If a player's slot changes position in the array (e.g., Valve reorders the `players` array mid-game, or a player reconnects), React will reuse the wrong DOM nodes. Player rows contain animated elements (respawn timer overlay) that can glitch if the key is unstable.

**Fix:** Use a stable player identifier. `account_id` is the best candidate (with a fallback to `hero_id` for slots that have no account yet):
```tsx
{radiantPlayers.map((p) => (
  <PlayerRow
    key={p.account_id ?? p.hero_id ?? p.name ?? String(Math.random())}
    player={p}
    hasGpm={hasGpm}
    hasXpm={hasXpm}
    hasLhDn={hasLhDn}
  />
))}
```

---

_Reviewed: 2026-04-25T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
