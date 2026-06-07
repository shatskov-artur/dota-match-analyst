---
phase: 07-in-game-item-intel
reviewed: 2026-04-28T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - server/src/schemas/valve.ts
  - shared/itemMapper.ts
  - client/src/utils/itemMapper.ts
  - client/src/utils/formatNW.ts
  - client/src/components/ItemsBlock.tsx
  - client/src/pages/MatchPage.tsx
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-04-28
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Reviewed all six files introduced/modified for the in-game item intel feature. The schema additions in `valve.ts`, the `itemMapper` pair, and `formatNW` are all solid. The critical problem is in `MatchPage.tsx`: player data is being sourced from the wrong object (`draft.scoreboard.radiant/dire.players`) which does not exist in the Valve scoreboard shape — meaning `ItemsBlock` always receives an empty array and renders nothing. Two additional warnings cover a CSS specificity bug that swallows the neutral-item gold border and a fragile gating condition that ties the item block's visibility to the draft scoreboard rather than game state.

---

## Critical Issues

### CR-01: ItemsBlock always receives empty players — wrong data source in MatchPage

**File:** `client/src/pages/MatchPage.tsx:107-110`

**Issue:** The code reads player data from `draft.scoreboard.radiant['players']` and `draft.scoreboard.dire['players']`. The `Scoreboard` type (from `useDraftDetail`) only contains `radiant.picks`, `radiant.bans`, `dire.picks`, `dire.bans` — there is no `players` array inside the scoreboard. The `['players'] ?? []` fallback therefore always returns `[]`, so `ItemsBlock` always receives an empty array and renders nothing (`players.length === 0` → `return null`).

Player items come from `match.players` (Valve live API, already available via `useMatchDetail`), not from the draft scoreboard. The fix is to read from `radiantPlayers` / `direPlayers` which are already destructured from `useMatchDetail` at line 18.

**Fix:**

Replace lines 104-113:
```tsx
{/* WRONG — draft.scoreboard does not carry a players array */}
{draft.scoreboard && (
  <div className="w-fit">
    <ItemsBlock
      players={(([
        ...((draft.scoreboard.radiant as Record<string, unknown[]>)?.['players'] ?? []).map(...)
        ...((draft.scoreboard.dire as Record<string, unknown[]>)?.['players'] ?? []).map(...)
      ]) as ...[]).sort(...)}
    />
  </div>
)}
```

With:
```tsx
{/* Correct — items come from match.players via useMatchDetail, not the draft scoreboard */}
{(radiantPlayers.length > 0 || direPlayers.length > 0) && (
  <div className="w-fit">
    <ItemsBlock
      players={[
        ...radiantPlayers.map(p => ({ ...p, team: 'radiant' as const })),
        ...direPlayers.map(p => ({ ...p, team: 'dire' as const })),
      ].sort((a, b) => (b.net_worth ?? 0) - (a.net_worth ?? 0))}
    />
  </div>
)}
```

`radiantPlayers` and `direPlayers` are already available at line 18 via `useMatchDetail`. Each player object already contains `item0`–`item5`, `item_neutral`, `item6`–`item8` when in-game (per `valve.ts` schema).

---

## Warnings

### WR-01: Neutral-slot gold border overridden by hardcoded empty-slot border

**File:** `client/src/components/ItemsBlock.tsx:40-46`

**Issue:** When an item slot is empty (`isEmpty === true`) and `variant === 'neutral'`, the component renders:
```tsx
<div
  style={{ ...baseStyle, ...neutralStyle, background: '#1a1a1a', border: '1px solid #2a2a2a' }}
  ...
/>
```
The spread order applies `neutralStyle` (which sets `border: '1px solid #888866'`) first, then the hardcoded `border: '1px solid #2a2a2a'` overwrites it. The gold neutral border never appears on an empty neutral slot.

**Fix:**
```tsx
// Apply neutralStyle last so it wins over the default dark border:
<div
  style={{ ...baseStyle, background: '#1a1a1a', border: '1px solid #2a2a2a', ...neutralStyle }}
  aria-label="Empty item slot"
/>
```

### WR-02: ItemsBlock visibility gated on draft scoreboard instead of game state

**File:** `client/src/pages/MatchPage.tsx:104`

**Issue:** `{draft.scoreboard && (` is the condition guarding the `ItemsBlock`. The `draft.scoreboard` value comes from `useDraftDetail`, which stops polling once `game_state !== 2` (per `computeDraftInterval`). While the cached scoreboard value persists (so the block stays visible after draft ends), this is an accidental dependency — the item block's intent is to appear during in-game state (`game_state === 5`), not draft state. Additionally, if the draft endpoint is slow or errors on first load of a live in-game match, the item block will not appear even though all necessary data is already available from `match.players`.

**Fix:** Gate on whether there are players with item data, or explicitly on game state:
```tsx
{match?.game_state === 5 && (radiantPlayers.length > 0 || direPlayers.length > 0) && (
  <div className="w-fit">
    <ItemsBlock players={...} />
  </div>
)}
```
This is consistent with the WR-01 fix: once the data source is corrected to `radiantPlayers`/`direPlayers`, the correct gate becomes obvious.

---

## Info

### IN-01: shared/itemMapper.ts — Node.js-only import not enforced at module level

**File:** `shared/itemMapper.ts:1-7`

**Issue:** The file starts with `import { createRequire } from 'module'` (Node.js built-in) and uses `createRequire(import.meta.url)`. The comment documents that this must not be imported in browser context, but there is no build-time guard (e.g., `package.json` `exports` field restricting the entry point, or a Vite `resolve.alias` that redirects the shared import). A future developer adding `import { itemMapper } from '../../../shared/itemMapper'` in a client file would get a confusing Vite bundling error.

**Fix (suggestion):** The dual-file pattern (`shared/itemMapper.ts` for Node, `client/src/utils/itemMapper.ts` for browser) already exists and is correct. Consider adding a `// @browser-unsafe` JSDoc tag or eslint `no-restricted-imports` rule to prevent accidental client-side imports of the shared file.

### IN-02: formatNW does not handle negative net worth

**File:** `client/src/utils/formatNW.ts:7-11`

**Issue:** The function handles `undefined` and values `>= 1000`, but negative values (which can appear briefly in Dota for couriers or unusual edge cases) produce output like `"-0.9k"` from `(value / 1000).toFixed(1) + 'k'`. This is cosmetically odd but not incorrect — the formatted string is valid. No crash risk.

**Fix (suggestion):** If negative values should be clamped to `0` or displayed differently, add a guard:
```ts
if (value < 0) return '0'
```
Otherwise, document the current behavior as intentional.

---

_Reviewed: 2026-04-28_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
