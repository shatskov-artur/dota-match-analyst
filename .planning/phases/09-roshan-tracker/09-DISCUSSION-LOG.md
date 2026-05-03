# Phase 9: Roshan Tracker - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-03
**Phase:** 09-roshan-tracker
**Areas discussed:** Detection reliability, Redis storage, UI placement & look, Loot table source, Icons, API shape

---

## Detection Reliability

| Option | Description | Selected |
|--------|-------------|----------|
| Pure transition detector | Compare prevTimer/curTimer in Redis; no fallback | ✓ |
| Transition + duration validation | Require cur >= 300s | |
| Transition + OpenDota fallback | Post-game match-parse reconciliation | |

| Option | Description | Selected |
|--------|-------------|----------|
| match_id as key | New match → new key, automatic reset | ✓ |
| match_id + game_state==1 reset | Extra defensive check | |

| Option | Description | Selected |
|--------|-------------|----------|
| Counter starts at 1 | Bootstrap on mid-match join | ✓ |
| Counter=0 + 'unknown' marker | Honest but ugly UI | |
| OpenDota match parse bootstrap | Live matches not parsed in realtime | |

| Option | Description | Selected |
|--------|-------------|----------|
| Don't show aegis reclaim | Pickup invisible in Valve API | |
| Show last-kill loot | 'LAST DROP: <icons>' row | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Pino info-level on each kill | logger.info with matchId, killNumber, timers | ✓ |
| Debug only | | |
| No logging | | |

---

## Redis Storage

| Option | Description | Selected |
|--------|-------------|----------|
| JSON with full history | { killCount, prevTimer, kills: [...] } | ✓ |
| Minimum: counter + prevTimer | Two numbers only | |
| Hash with fields | HSET fields, breaks cached() pattern | |

| Option | Description | Selected |
|--------|-------------|----------|
| 6 hour TTL | Buffer for pauses + post-game viewing | ✓ |
| 24 hour TTL | Extra safety | |
| No TTL | Risk of key accumulation | |

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in match-detail handler | Read/compare/write inside cached BFF handler | ✓ |
| Separate background poller | Burns Valve quota with no viewers | |
| Hook inside cached() refresh | Abstraction blur | |

| Option | Description | Selected |
|--------|-------------|----------|
| No race protection | cached(30s) makes it idempotent | ✓ |
| Lua atomic CAS | Overkill | |

---

## UI Placement & Look

| Option | Description | Selected |
|--------|-------------|----------|
| Right stack between Map and Cooldowns | [DotaMapView, RoshanBlock, CooldownsBlock] | ✓ |
| Strip under ScoreHeader | Changes top layout | |
| Overlay on DotaMapView | No room for loot/countdown | |

| Option | Description | Selected |
|--------|-------------|----------|
| Compact alive-state | Header + loot icon row | ✓ |
| Large with illustration | ~150px tall | |
| Pill | One-line summary | |

| Option | Description | Selected |
|--------|-------------|----------|
| Large mm:ss countdown | Centered + dimmed loot icons | ✓ |
| Progress bar + small mm:ss | Misleading because rosh respawn is 8-11min random | |

| Option | Description | Selected |
|--------|-------------|----------|
| Bottom row 'LAST DROP' | Small label + icons | ✓ |
| Tooltip on hover | More hidden | |

| Option | Description | Selected |
|--------|-------------|----------|
| Client-tick 1s | Matches CooldownsBlock + project memory rule | ✓ |
| Poll-only | Bad UX | |

---

## Loot Table

| Option | Description | Selected |
|--------|-------------|----------|
| TS const in shared/ | shared/roshanLoot.ts | ✓ |
| JSON file | Overkill for 4 entries | |
| OpenDota constants endpoint | Roshan loot not exposed there anyway | |

| Option | Description | Selected |
|--------|-------------|----------|
| Comment + const PATCH | // VERIFIED + ROSHAN_LOOT_PATCH = '7.41' | ✓ |
| Comment only | | |
| No marker | Risk of stale data | |

---

## Icons

| Option | Description | Selected |
|--------|-------------|----------|
| OpenDota CDN | Same as ItemsBlock | ✓ |
| Local assets | Bundle bloat | |
| Roshan icon only | Visually poor | |

---

## API Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Embed in match-detail | match.roshan: {...} | ✓ |
| Separate /roshan endpoint | Extra round-trip | |

---

## Claude's Discretion

- Exact spacing/typography of RoshanBlock
- Internal helper naming
- Whether full kill history is hydrated to client now or deferred

## Deferred Ideas

- Aegis pickup detection (requires OpenDota live parse, not available)
- Aegis 5-min reclaim countdown (depends on pickup detection)
- Tormentor tracker (out of scope per ROADMAP)
- Roshan history in post-game match recap (data already stored, future phase)
- Hover tooltip with full kill history
</content>
</invoke>