---
phase: 07-in-game-item-intel
plan: "03"
subsystem: client itemMapper + formatNW + ItemsBlock
tags: [tdd, react, items, vitest]
dependency_graph:
  requires: [07-01]
  provides: [client/src/utils/itemMapper.ts GREEN, client/src/utils/formatNW.ts GREEN, client/src/components/ItemsBlock.tsx]
  affects: [07-04-PLAN (MatchPage integration)]
tech_stack:
  added: []
  patterns: [Vite JSON import, TDD RED→GREEN, CDN item icons, onError fallback]
key_files:
  created:
    - client/src/utils/itemMapper.ts
    - client/src/utils/formatNW.ts
    - client/src/components/ItemsBlock.tsx
  modified: []
decisions:
  - "ItemEntry.dname made optional (dname?: string) — items.json recipe entries lack dname field, causing TS2352 cast failure"
  - "ItemSlot uses useState(imgError) for onError fallback — avoids broken img when CDN lacks an entry"
  - "Backpack/neutral slots conditionally rendered only when item_neutral/item6 fields are present"
metrics:
  duration: "~8 minutes (including orchestrator recovery)"
  completed: "2026-04-28"
  tasks_completed: 3
  files_created: 3
  files_modified: 0
---

# Phase 7 Plan 03: Client itemMapper + formatNW + ItemsBlock Summary

## What Was Built

Three client-side deliverables completing the data layer for in-game item display:

**`client/src/utils/itemMapper.ts`** — Browser-safe item ID→name mapper using Vite native JSON import (not `createRequire` which is Node.js-only). Builds a reverse lookup map at module load time for O(1) resolution. Returns `null` for id=0 (empty slot) and unknown IDs.

**`client/src/utils/formatNW.ts`** — Net worth formatter: `>=1000` → `"X.Xk"` (e.g. `12400` → `"12.4k"`), `<1000` → raw string, `undefined` → `"—"` (em dash U+2014).

**`client/src/components/ItemsBlock.tsx`** — Cross-team NW-ranked hero table. Each row shows: rank number (Radiant=#4ade80, Dire=#ef4444), hero portrait, net worth, 6 main item slots, optional neutral item (gold border, 75% opacity), optional backpack group (60% opacity). Empty/failed slots render as dark `#1a1a1a` placeholder divs. CDN URL: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/{name}.png`.

## TDD Gate

- **RED** (07-01): `itemMapper.test.ts` and `formatNW.test.ts` stubs created as failing
- **GREEN** (07-03): Both test files pass — 76/76 client tests passing

## Self-Check: PASSED

All must_haves verified:
- [x] itemMapper.test.ts GREEN — itemMapper(1)='blink', itemMapper(0)=null, itemMapper(137)='radiance'
- [x] formatNW.test.ts GREEN — formatNW(12400)='12.4k', formatNW(undefined)='—'
- [x] ItemsBlock accepts pre-sorted players array, renders 6 main slots per row
- [x] Empty slot (id=0 or undefined) → dark placeholder div
- [x] CDN URL pattern implemented in ItemSlot
- [x] onError handler falls back to placeholder via imgError state
- [x] Rank colors: #4ade80 Radiant, #ef4444 Dire
