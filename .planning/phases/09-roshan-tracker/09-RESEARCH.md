# Phase 9: Roshan Tracker - Research

**Researched:** 2026-05-03
**Domain:** Server-side state inference + UI countdown widget
**Confidence:** HIGH (code patterns) / MEDIUM (API field semantics) / **LOW (current-patch loot table — contradictory sources, see Open Questions)**

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Pure transition detector — compare `prevTimer` (Redis) to `curTimer` (current scoreboard). If `prev === 0 && cur > 0` → increment. No external fallbacks.
- **D-02:** No duration validation gate (no `cur >= 300`). Revisit only if false-reset observed in production.
- **D-03:** Match boundary = `match_id`. Each match gets its own Redis key. No `game_state` reset logic.
- **D-04:** Bootstrap on mid-match join: first observed `timer > 0` with no prior Redis state → `killCount = 1`. Undercount accepted.
- **D-05:** `logger.info({ matchId, killNumber, prevTimer, curTimer }, 'roshan kill detected')` per increment.
- **D-06:** Redis key `roshan:{matchId}` → JSON `{ killCount, prevTimer, kills: Array<{n, gameTime, timestamp}> }`.
- **D-07:** TTL 6 hours.
- **D-08:** Inline write inside the cached match-detail BFF handler. Idempotent (prev === cur short-circuits).
- **D-09:** No Lua / no atomic CAS.
- **D-10:** Mount `[DotaMapView, RoshanBlock, CooldownsBlock]` in 320px right column. **No restructuring.**
- **D-11:** Alive — compact: `ROSHAN #N` header + horizontal loot icon row.
- **D-12:** Dead — large monospace `mm:ss` countdown + `RESPAWN` label + dimmed next-kill icons below.
- **D-13:** `LAST DROP:` row at bottom once `killCount >= 1`.
- **D-14:** Client-tick `setInterval(1000)` (mirrors CooldownsBlock).
- **D-15:** TS const `ROSHAN_LOOT: Record<number, ItemId[]>` in `shared/roshanLoot.ts`. Item IDs reuse `itemMapper`.
- **D-16:** `const ROSHAN_LOOT_PATCH = '7.41' as const` + `// VERIFIED: patch 7.41` header comment.
- **D-17:** Kill 1 = Aegis; 2 = Aegis+Cheese; 3 = +Shard; 4+ = +Blessing. **⚠️ See Open Question OQ-1 — this table is contradicted by live web sources for current patch 7.41.**
- **D-18:** Icons via OpenDota CDN: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/{name}.png`.
- **D-19:** `match.roshan: { killCount, alive, respawnIn, lastKillLoot }` inside match-detail response.
- **D-20:** Computed in BFF; client just renders.

### Claude's Discretion
- Spacing / typography of RoshanBlock within MatchPage palette (`#0a0a0a` / `#d8d8d8` / accent `#b03030`).
- Helper naming (`detectRoshanKill`, `roshanState`, etc.).
- Whether `kills[]` history is hydrated to client now or deferred.

### Deferred Ideas (OUT OF SCOPE)
- Aegis pickup detection.
- Aegis 5-min reclaim countdown.
- Tormentor tracker.
- Roshan history in match recap.
- Tooltip-on-hover for full kill history.
</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 9 has no v1 REQ-IDs (Roshan respawn timer is listed under v2 Deferred in REQUIREMENTS.md but is being delivered now). Success criteria from ROADMAP §"Phase 9":

| ID | Description | Research Support |
|----|-------------|------------------|
| ROSH-01 | Counter persists across page refreshes (Redis per match) | Redis cache pattern §6 — raw ioredis access via exported `redis` client |
| ROSH-02 | "Roshan #N" with exact loot icons | OpenDota CDN URL pattern §4 + items.json IDs §1 |
| ROSH-03 | Respawn countdown when dead (reuses `roshan_respawn_timer`) | Field already extracted in live.ts §3; client-tick pattern §8 |
| ROSH-04 | Counter resets on new `match_id` | Per-match Redis key + 6h TTL handles natural rollover |
</phase_requirements>

## Summary

Phase 9 is a thin server-side state-inference layer plus a sibling UI block that fits an existing 320px right column. All infrastructure (Redis, zod schemas, OpenDota CDN icon pattern, client-tick `setInterval`, dynamic refetchInterval) is already in place from Phases 3-8. Implementation is mostly assembly: write a `roshanState.ts` helper, mount it inline in the `/api/live/games` handler (Phase 9 does NOT have a dedicated `/api/live/match/:id` route — match-detail flows through `/api/live/games` enriched per game), add a typed `match.roshan` field to the BFF response schema, build `shared/roshanLoot.ts` constant, and create `RoshanBlock.tsx` mirroring CooldownsBlock structure.

**Two non-trivial findings flagged for the planner:**
1. **Loot table for patch 7.41 is in dispute** — multiple independent web sources contradict the table locked in D-17. The locked table appears to be a holdover from patch 7.36/older. See OQ-1 — needs user decision before implementation, or code-time re-verification by playing/watching a current pro match. The Redis key, TS constant, and `ROSHAN_LOOT_PATCH = '7.41'` mechanics are all correct; only the *contents* of the table are uncertain.
2. **`roshan_respawn_timer` is not in the zod schema** — currently extracted via `Record<string, unknown>` cast at line 59 of `server/src/routes/live.ts`. Phase 9 plan should add it to `PlayerSchema`'s parent `ScoreboardSchema` via `.passthrough()` (or top-level if Valve also surfaces it there).

**Primary recommendation:** Resolve OQ-1 with the user via `/gsd-discuss-phase` follow-up before starting; everything else can proceed in parallel (Wave 0 tests, schema add, helper, UI scaffold).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Roshan kill detection (transition logic) | API / Backend | — | Stateful inference across polls; needs Redis. Cannot live in client (no shared state across viewers). |
| Roshan state persistence | Database / Storage (Redis) | — | Survives BFF restarts; per-match scoping. |
| Loot table lookup (kill# → items) | Shared (TS const) | — | Pure function; both client and server may import for future kill-history display. Lives in `shared/`. |
| Respawn countdown (visual mm:ss tick) | Browser / Client | API (resync every 30s) | Backend cannot push 1Hz updates; client setInterval owns the tick, server snapshot resyncs drift. |
| Loot icons (rendering) | Browser / Client | CDN (OpenDota Cloudflare) | Static assets; same pattern as ItemsBlock. |
| Bootstrap fallback (mid-match join) | API / Backend | — | Backend is the only side with `prevTimer` history. |

## Standard Stack

### Core (already installed — no new deps)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ioredis | ^5.0.0 | Redis client for `roshan:{matchId}` GET/SET | Already used by `cached()` decorator |
| zod | ^3.0.0 | Validate Valve `roshan_respawn_timer` + define `match.roshan` schema | Project-wide pattern |
| pino | ^9.0.0 | `logger.info` on each detected kill (D-05) | Already in deps; **NOT yet wired into routes** — see OQ-2 |
| Hono | ^4.0.0 | BFF route handler | Existing |
| React | ^19.2.0 | RoshanBlock component | Existing |
| TanStack Query | ^5.0.0 | Inherits `match.roshan` via existing useMatchDetail | No new hook |
| Vitest | ^2.0.0 | Unit/integration/component tests | Existing config in server + client |

### Supporting (existing utilities)
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `server/src/cache.ts` exports `redis` (private), `cached()` (public), `TTL` | Redis access | Need to **export `redis` directly** OR add a helper `getJson<T>(key)`/`setJson<T>(key, val, ttl)` for raw key access (current `cached()` is the wrong shape — it computes-on-miss; Roshan needs read-then-conditional-write) |
| `shared/itemMapper.ts` | `id → name` mapping for icon URLs | RoshanBlock loot icons |
| `client/src/utils/itemMapper.ts` | Browser-safe variant (Vite JSON import) | RoshanBlock client component |
| `shared/items.json` | Source of truth for item IDs (already loaded in Phase 7) | TS constant in `shared/roshanLoot.ts` |

**Verified item IDs (from `shared/items.json`, 2026-05-03):**
| Item Name (CDN) | Item ID | Display Name |
|-----------------|---------|--------------|
| `aegis` | **117** | Aegis of the Immortal |
| `cheese` | **33** | Cheese |
| `aghanims_shard` | **609** | Aghanim's Shard |
| `ultimate_scepter_2` | **271** | Aghanim's Blessing |
| `refresher_shard` | **260** | Refresher Shard *(only relevant if OQ-1 resolves to current-patch table)* |
| `aghanims_shard_roshan` | 725 | Aghanim's Shard - Consumable *(NOT used; this is the per-match consumable variant)* |
| `ultimate_scepter_roshan` | 727 | Aghanim's Blessing - Roshan *(consumable variant, NOT base 271)* |

**⚠️ Variant decision:** OpenDota CDN serves both `ultimate_scepter_2.png` (the standard purchasable item) and `ultimate_scepter_roshan.png` (the Roshan-drop consumable variant). Liquipedia describes recent patches as dropping "Aghanim's Blessing - Roshan" specifically (item 727). **D-17 currently specifies "Aghanim's Blessing"** without distinguishing — recommend planner clarify whether icon should be `ultimate_scepter_2.png` (cosmetic match for player intuition, since most fans recognize the regular item icon) or `ultimate_scepter_roshan.png` (semantically accurate). [VERIFIED: shared/items.json grep, 2026-05-03]

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline detector in match-detail handler | Background poller every 5s | More accurate (catches every transition) but adds infra complexity, breaks stateless BFF, conflicts with D-08. **Skip.** |
| Per-user Redis keys | Per-`match_id` keys | Per-user keys waste memory and don't solve cross-viewer consistency. Locked: per-match (D-08). |

**Installation:** None required.

**Version verification:** All deps verified present in `server/package.json` and `client/package.json` at session start. No version bump needed.

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────┐    30s poll      ┌────────────────────────┐
│  React UI    │ ◄─────────────── │ /api/live/games BFF    │
│  MatchPage   │                  │ (Hono route)           │
│              │                  │                        │
│  RoshanBlock │                  │  per-game enrichment:  │
│   tick 1s    │                  │   ┌─────────────────┐  │
│   (client    │                  │   │ Roshan logic    │  │
│    setInterv)│                  │   │  1. read Redis  │  │
└──────────────┘                  │   │  2. detect 0→>0 │  │
        ▲                         │   │  3. write Redis │  │
        │                         │   │  4. compose     │  │
        │ via match.roshan        │   │     match.roshan│  │
        │                         │   └─────────────────┘  │
        │                         │           │            │
        │                         │           ▼            │
        │                         │   ┌──────────────────┐ │
        │                         │   │ Upstash Redis    │ │
        │                         │   │ roshan:{matchId} │ │
        │                         │   │ TTL 6h           │ │
        │                         │   └──────────────────┘ │
        │                         │                        │
        │                         │  cached('live-games',  │
        │                         │     30s) outer wrap    │
        │                         └────────┬───────────────┘
        │                                  │
        │                                  ▼
        │                          ┌──────────────────┐
        │                          │ Valve Web API    │
        │                          │ GetLiveLeague    │
        │                          │ Games            │
        │                          │ (scoreboard.     │
        │                          │  roshan_respawn  │
        │                          │  _timer)         │
        │                          └──────────────────┘
        │
        │ static asset
        ▼
┌──────────────────────────────────────────────────┐
│ OpenDota Cloudflare CDN                          │
│ /apps/dota2/images/dota_react/items/{name}.png   │
└──────────────────────────────────────────────────┘
```

Component responsibilities:

| File | Responsibility |
|------|----------------|
| `server/src/services/roshanState.ts` (NEW) | Pure detector + Redis read/write helpers |
| `server/src/routes/live.ts` (MODIFY) | Inline call into roshanState within `/games` per-game enrichment loop; surface `match.roshan` |
| `server/src/cache.ts` (MODIFY) | **Export raw `redis` client** OR add `getJson/setJson` helpers (current `cached()` shape is wrong for read-modify-write) |
| `server/src/schemas/valve.ts` (MODIFY) | Add `roshan_respawn_timer` to ScoreboardSchema (currently extracted via untyped cast) |
| `server/src/schemas/bff.ts` (MODIFY) | Add `match.roshan` shape to EnrichedLiveGameSchema |
| `shared/roshanLoot.ts` (NEW) | TS const `ROSHAN_LOOT: Record<number, number[]>` + `ROSHAN_LOOT_PATCH = '7.41'` |
| `client/src/components/RoshanBlock.tsx` (NEW) | Render alive/dead/last-drop states; `setInterval(1000)` countdown |
| `client/src/pages/MatchPage.tsx` (MODIFY) | Mount `<RoshanBlock>` between `<DotaMapView>` and `<CooldownsBlock>` (line ~152) |

### Recommended Project Structure
```
server/src/
├── services/
│   └── roshanState.ts          # NEW — detector + Redis helpers
├── routes/
│   └── live.ts                 # MODIFY — inline call in /games per-game map
├── schemas/
│   ├── valve.ts                # MODIFY — add roshan_respawn_timer to ScoreboardSchema
│   └── bff.ts                  # MODIFY — extend EnrichedLiveGameSchema with .roshan
└── cache.ts                    # MODIFY — export redis OR add getJson/setJson

shared/
└── roshanLoot.ts               # NEW

client/src/
├── components/
│   └── RoshanBlock.tsx         # NEW
├── utils/
│   └── roshanLoot.ts           # NEW (browser-safe re-export OR mirror)
└── pages/
    └── MatchPage.tsx           # MODIFY — insert <RoshanBlock> at line ~152
```

### Pattern 1: Read-Modify-Write Redis State (Inline in Cached Handler)

**What:** The transition detector runs inside the `/api/live/games` handler, which is itself wrapped in the existing `cached('live-games', 30)` decorator (see Phase 7/8). The 30s outer cache means the detector runs at most once per 30s per match — natural deduplication, no race.

**When to use:** Per-match state inference where the writer is the same process that polls the upstream.

**Anti-pattern:** DO NOT wrap the Roshan logic itself in `cached()` — it's a side-effect, not a pure compute. Use raw `redis.get` / `redis.set`.

```typescript
// Source: synthesized from server/src/cache.ts (existing redis client) + project patterns
// File: server/src/services/roshanState.ts
import { redis } from '../cache.js'  // requires exporting redis (currently private)
import { logger } from '../logger.js' // pino logger — see OQ-2 (may need to scaffold)

export interface RoshanState {
  killCount: number
  prevTimer: number
  kills: Array<{ n: number; gameTime: number; timestamp: number }>
}

const TTL_SECONDS = 6 * 60 * 60  // D-07

export async function readRoshanState(matchId: number): Promise<RoshanState | null> {
  if (!redis) return null
  try {
    const raw = await redis.get(`roshan:${matchId}`)
    return raw ? (JSON.parse(raw) as RoshanState) : null
  } catch (err) {
    console.error(`[roshan] read error for ${matchId}:`, (err as Error).message)
    return null
  }
}

export async function writeRoshanState(matchId: number, state: RoshanState): Promise<void> {
  if (!redis) return
  try {
    await redis.set(`roshan:${matchId}`, JSON.stringify(state), 'EX', TTL_SECONDS)
  } catch (err) {
    console.error(`[roshan] write error for ${matchId}:`, (err as Error).message)
  }
}

// Pure: input → input. Easy to unit-test (no Redis, no clocks).
export function detectRoshanKill(
  prev: RoshanState | null,
  curTimer: number | undefined,
  gameTime: number,
  now: number,
): { state: RoshanState; killed: boolean } {
  // No timer field present → no scoreboard yet (draft phase). Don't write.
  if (curTimer === undefined) {
    return { state: prev ?? { killCount: 0, prevTimer: 0, kills: [] }, killed: false }
  }

  // First observation
  if (prev === null) {
    if (curTimer > 0) {
      // D-04 bootstrap: assume kill #1 already happened
      return {
        state: { killCount: 1, prevTimer: curTimer, kills: [{ n: 1, gameTime, timestamp: now }] },
        killed: true,
      }
    }
    return { state: { killCount: 0, prevTimer: 0, kills: [] }, killed: false }
  }

  // Steady state: detect 0 → >0 transition (D-01)
  if (prev.prevTimer === 0 && curTimer > 0) {
    const n = prev.killCount + 1
    return {
      state: {
        killCount: n,
        prevTimer: curTimer,
        kills: [...prev.kills, { n, gameTime, timestamp: now }],
      },
      killed: true,
    }
  }

  // No transition — just refresh prevTimer
  return {
    state: { ...prev, prevTimer: curTimer },
    killed: false,
  }
}
```

### Pattern 2: Inline Enrichment in `/api/live/games` Handler

**What:** The match-detail endpoint is `/api/live/games` (singular `getLiveLeagueGames` shared across all viewers — see Phase 3 D-15 / `useMatchDetail`). Per-game enrichment happens in `enriched = games.map(...)` at `live.ts:45`. Roshan logic must be `async` per game; the existing `.map` is sync.

**Refactor pattern:** Switch `games.map(g => {...})` to `Promise.all(games.map(async g => {...}))` so each game can do its Redis read/write in parallel. The 30s outer `cached('live-games')` wrapper means this only runs once per 30s anyway.

```typescript
// Source: synthesized from server/src/routes/live.ts:45-115 + Roshan integration
const enriched = await Promise.all(games.map(async (g) => {
  // ... existing scoreboard extraction, players merge ...
  const sbRoshanTimer = typeof sb?.roshan_respawn_timer === 'number'
    ? (sb.roshan_respawn_timer as number)
    : undefined

  // Roshan: read prev → detect → conditionally write
  const matchId = g.match_id
  const prevState = await readRoshanState(matchId)
  const { state: nextState, killed } = detectRoshanKill(
    prevState,
    sbRoshanTimer,
    sb?.duration ?? 0,
    Date.now(),
  )
  if (killed || prevState?.prevTimer !== nextState.prevTimer) {
    await writeRoshanState(matchId, nextState)
  }
  if (killed) {
    logger.info(
      { matchId, killNumber: nextState.killCount, prevTimer: prevState?.prevTimer ?? 0, curTimer: sbRoshanTimer },
      'roshan kill detected',
    )
  }

  // Build match.roshan response field (D-19)
  const roshan = nextState.killCount > 0 || sbRoshanTimer !== undefined ? {
    killCount: nextState.killCount,
    alive: (sbRoshanTimer ?? 0) === 0,
    respawnIn: (sbRoshanTimer ?? 0) > 0 ? sbRoshanTimer : null,
    lastKillLoot: nextState.killCount > 0
      ? lookupRoshanLoot(nextState.killCount)
      : null,
  } : null

  return {
    ...g,
    /* existing fields */
    roshan,
    league_name: nameMap[g.league_id] ?? `League #${g.league_id}`,
  }
}))
```

[VERIFIED: server/src/routes/live.ts:22-115, 2026-05-03]

### Pattern 3: Client-Tick `setInterval(1000)` Countdown

Mirror CooldownsBlock pattern (`client/src/components/CooldownsBlock.tsx:44-62`) — content signature ref + reference time ref + `setInterval` driving a `useState(now)`. Reference time only resets when `respawnIn` changes server-side, so unrelated MatchPage re-renders don't restart the countdown.

```typescript
// Source: client/src/components/CooldownsBlock.tsx:44-63 (verified pattern)
const contentSig = `${roshan.respawnIn ?? ''}:${roshan.killCount}`
const sigRef = useRef(contentSig)
const referenceRef = useRef<number>(Date.now())
if (sigRef.current !== contentSig) {
  sigRef.current = contentSig
  referenceRef.current = Date.now()
}
const [now, setNow] = useState<number>(Date.now())
useEffect(() => {
  const id = setInterval(() => setNow(Date.now()), 1000)
  return () => clearInterval(id)
}, [])
const elapsedSeconds = (now - referenceRef.current) / 1000
const remaining = roshan.respawnIn != null
  ? Math.max(0, roshan.respawnIn - elapsedSeconds)
  : 0
```

### Pattern 4: Loot Table TS Constant

```typescript
// Source: shared/roshanLoot.ts (NEW)
// VERIFIED: patch 7.41 (2026-05-03) — see RESEARCH.md OQ-1
export const ROSHAN_LOOT_PATCH = '7.41' as const

// Item IDs from shared/items.json:
//   117=aegis, 33=cheese, 609=aghanims_shard, 271=ultimate_scepter_2 (Aghanim's Blessing)
export const ROSHAN_LOOT: Record<number, readonly number[]> = {
  1: [117],
  2: [117, 33],
  3: [117, 33, 609],
  // 4+ uses the same drop, looked up via Math.min
}

export function lookupRoshanLoot(killNumber: number): readonly number[] {
  if (killNumber <= 0) return []
  if (killNumber >= 4) return [117, 33, 271]
  return ROSHAN_LOOT[killNumber] ?? []
}
```

### Anti-Patterns to Avoid
- **Wrapping the Roshan write in `cached()`** — `cached()` is for upstream-fetch memoization, not for stateful side effects. Use raw `redis.get`/`set`.
- **Re-deriving `lastKillLoot` on the client** — D-19 says BFF computes it. Client just renders.
- **Polling Valve directly from RoshanBlock** — All data flows through `useMatchDetail` already; RoshanBlock is presentational.
- **Per-user Redis keys** — Phase 5 T-5-04 DoS pattern: outer cache key per `matchId`, never per-user.
- **Restructuring the right column** — project memory: do NOT silently re-flow shipped UI; only insert.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Item ID → icon URL | Custom item dictionary | Existing `shared/items.json` + `client/src/utils/itemMapper.ts` (Phase 7) | Already verified, 1500+ items, OpenDota maintains it |
| Redis client lifecycle | New ioredis instance | Reuse exported `redis` from `server/src/cache.ts` | Single connection pool, error handler already wired |
| BFF response validation | Untyped JSON | Extend `EnrichedLiveGameSchema` with `.roshan` zod object | Project pattern, type-safe client consumption |
| Match-detail polling cadence | New TanStack hook | `useMatchDetail` already wired for 30s + post-game stop | DRY — Phase 3 D-12/D-14 |
| 1Hz client tick | RAF or custom timer manager | `setInterval(1000)` per CooldownsBlock | Project memory: client-tick required for any countdown |

**Key insight:** This phase is 90% assembly. Only genuinely new code is `roshanState.ts` (≤80 LOC) + `roshanLoot.ts` (≤30 LOC) + `RoshanBlock.tsx` (≤120 LOC).

## Common Pitfalls

### Pitfall 1: `roshan_respawn_timer` Absent in Pre-Game / Post-Game
**What goes wrong:** Detector reads `undefined`, treats as 0, false-positive bootstrap on subsequent draft polls.
**Why:** Valve omits scoreboard fields entirely when `game_state !== 5`. Same pattern as `building_state` (CLAUDE.md pitfall).
**How to avoid:** `detectRoshanKill` short-circuits on `curTimer === undefined`. Test with table-driven cases including undefined input.
**Warning signs:** killCount > 0 in matches that haven't started.

### Pitfall 2: Polling Continues Post-Game (game_state === 6)
**What goes wrong:** Roshan logic burns Redis writes for finished matches.
**Why:** TTL 6h covers post-game viewing window; if useMatchDetail keeps polling (it shouldn't — D-14 stops on game_state === 6), Redis writes still happen on every poll.
**How to avoid:** `useMatchDetail` already sets `refetchInterval: false` on game_state === 6 (verified `client/src/hooks/useMatchDetail.ts:39`). No backend gate needed — but **add a short-circuit** in `detectRoshanKill`: if `prev.killCount === nextState.killCount && prev.prevTimer === nextState.prevTimer`, **skip the write**. Already covered by the conditional write predicate above.
**Warning signs:** Excessive Redis SET ops in pino logs for matches with `game_state === 6`.

### Pitfall 3: Stale Loot Table at Patch Boundary
**What goes wrong:** D-17 table is wrong; users see incorrect predicted loot.
**Why:** Patch table is hardcoded; Valve doesn't expose loot mapping via API.
**How to avoid:** `ROSHAN_LOOT_PATCH = '7.41'` constant + grep-friendly comment header → easy to audit at each Dota patch. **Already a known issue** — see OQ-1.
**Warning signs:** User reports "this isn't what dropped".

### Pitfall 4: Bootstrap Undercounts Mid-Match Joiners
**What goes wrong:** Tournament viewer joins at minute 35; Roshan was already killed twice; we show "ROSHAN #2" not "#3".
**Why:** D-04 accepts this trade-off explicitly.
**How to avoid:** Document in UI somewhere subtle? Actually the user said "trade-off accepted" — no mitigation needed for v1. Only flag if user complains.
**Warning signs:** N/A.

### Pitfall 5: Image 404 on `ultimate_scepter_2.png` vs `ultimate_scepter_roshan.png`
**What goes wrong:** Wrong icon variant chosen → broken image.
**Why:** OpenDota CDN has both; which one is "the" Aghanim's Blessing depends on patch + UX intent.
**How to avoid:** `<img onError={...}>` fallback per ItemsBlock pattern (`client/src/components/ItemsBlock.tsx:56`). Default to `ultimate_scepter_2` for player familiarity. See OQ-1 / item ID variant decision above.

### Pitfall 6: Match-Detail Endpoint Doesn't Exist (Convention Mismatch)
**What goes wrong:** Plan assumes a `/api/live/match/:matchId` route. There isn't one — match-detail flows through `/api/live/games` per Phase 3 D-15.
**Why:** `useMatchDetail` reads from the same `['live-games']` query cache as `useLiveGames`. The CONTEXT.md mention of "GET /api/live/match/:id" in D-08 was aspirational/inaccurate.
**How to avoid:** Inline Roshan into `liveRoutes.get('/games', ...)` per-game enrichment. **Plan must reflect this** — do NOT scaffold a new route.
**Warning signs:** Tests assume a non-existent endpoint URL.

## Runtime State Inventory

> Phase 9 is greenfield (new Redis key, new TS const, new component). No rename/refactor. Section omitted per template guidance.

## Code Examples

See Patterns 1-4 above. All examples are synthesized from verified existing files.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-user cache keys | Per-`matchId` outer cache | Phase 5 (T-5-04) | DoS mitigation; same pattern Phase 9 reuses |
| Server clock for countdowns | Client `setInterval(1000)` | Phase 8 (user feedback memory) | Smooth UI ticks; backend resyncs on poll |
| Synchronous `games.map` enrichment | `Promise.all(games.map(async ...))` | **Phase 9 (this RFC)** | Required so Roshan Redis I/O can happen per game |

**Deprecated/outdated:**
- The pre-7.37 simple loot table (Aegis-only / Aegis+Cheese / Aegis+Cheese+Aghs+Refresher) — **D-17 may still describe this older formula**; current 7.41 sources contradict it (see OQ-1).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `roshan_respawn_timer` is always 0 when alive (never null) | Architecture / Pitfalls | False-positive bootstrap; mitigated by `=== undefined` check, but `=== null` would slip through. Plan should include a defensive `typeof === 'number'` guard. [ASSUMED based on existing `live.ts:59` cast pattern; not verified against a live payload] |
| A2 | Valve sends `roshan_respawn_timer = 0` exactly at respawn (not before) | Open Questions | Off-by-N-seconds in alive/dead state — minor UX issue, not data loss |
| A3 | `pino` logger is wired into the server but unused so far | Standard Stack | If logger not configured, D-05 needs scaffolding step in plan (~5 LOC) |
| A4 | Cheese (item id 33) is correct — `royale_with_cheese` (1154) is the joke item, not the Roshan drop | Standard Stack | Wrong icon; trivial fix [VERIFIED: shared/items.json grep] |

## Open Questions

### OQ-1: Patch 7.41 Roshan Loot Table — Sources Contradict D-17 (HIGH PRIORITY)
**What we know:**
- D-17 (locked): Kill 1 = Aegis · 2 = Aegis+Cheese · 3 = +Shard · 4+ = +Blessing
- Liquipedia /Roshan/Changelogs (fetched 2026-05-03): patch 7.41 only changed *spawn timing day/night*; the underlying patch 7.37 loot is "Roshan's Banner" + Refresher Shard + Cheese (Radiant) / Aghanim's Blessing - Roshan (Dire) — and **no Aghanim's Shard at all**
- Liquipedia /Roshan main page (fetched 2026-05-03): Kill 1 = Aegis only · 2 = Aegis+Banner · 3+ = Aegis+Banner+Cheese+Refresher Shard, no pit difference
- Hawk.live article on patch 7.37: agrees broadly with the per-pit Radiant/Dire split

**What's unclear:** Three independent sources give three different "current" tables. The locked D-17 table appears to predate patch 7.37.

**Recommendation:**
1. **STOP and ask user** before implementing — surface this contradiction in `/gsd-plan-phase` or follow-up `/gsd-discuss-phase`. The user explicitly said in CONTEXT.md "(re-verify at execute-time per ROADMAP `VERIFY` note)".
2. Options for the user:
   - **(a)** Keep D-17 as-is, knowing it may be wrong — ship now, fix when the first bug report arrives. Patch constant still says `'7.41'`.
   - **(b)** Replace with the Liquipedia /Roshan main-page table (Aegis / Aegis+Banner / Aegis+Banner+Cheese+Refresher), accepting a possible mismatch with the per-pit reality.
   - **(c)** Defer phase by 1 day; verify against a live pro match by watching one Roshan kill and recording what dropped.
3. The implementation mechanics (Redis key, TS const, lookup function, item IDs for Aegis/Cheese/Shard/Blessing all confirmed correct in items.json) are independent of which table wins — only the *contents* of `ROSHAN_LOOT` change.

**Note on Roshan's Banner:** if the user picks option (b), `roshans_banner` is NOT in `shared/items.json` as of 2026-05-03 (grep returned no match — the stash includes `cheese`, `aegis`, `aghanims_shard`, `ultimate_scepter_2`, but no banner item). This would require an extra step in the plan: identify the correct items.json key for Banner OR ship a placeholder icon. **This is itself a sub-blocker for option (b).**

### OQ-2: Pino Logger Wiring
**What we know:** `pino` is in `server/package.json` deps (`^9.0.0`), but `grep -rn "pino\|logger"` in `server/src/` returns no matches.
**What's unclear:** Whether D-05's `logger.info(...)` requires creating `server/src/logger.ts` from scratch.
**Recommendation:** Plan should include a Wave 0 task: `server/src/logger.ts` — `import pino from 'pino'; export const logger = pino()`. ~5 LOC. Alternative: keep using `console.log` for parity with existing code (`server/src/cache.ts:21,26`) and revisit in Phase 11 (Harden & Deploy).

### OQ-3: Variant Choice for Aghanim's Blessing Icon
**What we know:** Items.json has both `ultimate_scepter_2` (id 271, the regular shop item, Phase 9 plan default) and `ultimate_scepter_roshan` (id 727, the Roshan-drop consumable variant).
**What's unclear:** Which the user wants displayed.
**Recommendation:** Default to `ultimate_scepter_2.png` (more recognizable to viewers). Trivial to swap by changing one number in `roshanLoot.ts`. Mention in plan annotation, not a blocker.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Upstash Redis | Roshan state persistence | ✓ (assumed — used in all prior phases) | n/a | `cached()` already gracefully degrades when redis === null; `readRoshanState` returns null → `detectRoshanKill` re-bootstraps on next poll |
| OpenDota CDN (cloudflare) | Loot icons | ✓ (Phase 7 verified) | n/a | `<img onError>` falls back to dark placeholder square per ItemsBlock pattern |
| Valve `GetLiveLeagueGames` (`scoreboard.roshan_respawn_timer`) | Detector input | ✓ (currently extracted via cast at live.ts:59) | n/a | Field absent → detector short-circuits, no false bootstrap |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x (server + client both) |
| Config file | `server/vitest.config.ts`, `client/vitest.config.ts` (existing — verified by `*.test.ts` files in both) |
| Quick run command (server) | `cd server && npm test -- roshanState` |
| Quick run command (client) | `cd client && npm test -- RoshanBlock` |
| Full suite command | `cd server && npm test && cd ../client && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ROSH-01 | Counter persists across page refreshes | Integration | `cd server && npm test -- routes/live.roshan.test.ts` | ❌ Wave 0 |
| ROSH-02a | Loot lookup table returns correct items per kill# | Unit | `cd server && npm test -- shared/roshanLoot.test.ts` | ❌ Wave 0 |
| ROSH-02b | RoshanBlock renders loot icons in alive state | Component | `cd client && npm test -- components/RoshanBlock.test.tsx` | ❌ Wave 0 |
| ROSH-03 | Respawn countdown ticks down 1Hz; reaches 0 at correct moment | Component | `cd client && npm test -- components/RoshanBlock.test.tsx` (vitest fake timers) | ❌ Wave 0 |
| ROSH-04 | Counter resets on new `match_id` (different Redis key, no cross-pollination) | Unit | `cd server && npm test -- services/roshanState.test.ts` | ❌ Wave 0 |
| (detector) | Pure detector: prev/cur → expected count delta — table-driven | Unit | `cd server && npm test -- services/roshanState.test.ts` | ❌ Wave 0 |
| (bootstrap) | First poll, no prior state, timer>0 → killCount=1 | Unit | same file | ❌ Wave 0 |
| (no transition) | prev=0, cur=0 → no increment, no write | Unit | same file | ❌ Wave 0 |
| (steady-state dead) | prev=300, cur=295 → no increment | Unit | same file | ❌ Wave 0 |
| (respawn) | prev=5, cur=0 → no increment, prevTimer updated | Unit | same file | ❌ Wave 0 |
| (mid-game join, alive) | prev=null, cur=0 → killCount=0, no kill | Unit | same file | ❌ Wave 0 |
| (E2E walkthrough) | Full live match from draft → first Roshan kill → respawn | Manual | walk through on a live tournament match | ❌ documented in 09-VALIDATION.md |

### Sampling Rate
- **Per task commit:** `cd server && npm test -- roshanState` (or `roshanLoot` / `RoshanBlock` based on the file touched). Each ≤ 5s.
- **Per wave merge:** `cd server && npm test && cd ../client && npm test` — full suites, ≤ 30s combined.
- **Phase gate:** Full suite green + manual E2E walkthrough on a current live pro match documenting kill 1 transition.

### Wave 0 Gaps

All net-new test files:

- [ ] `server/src/services/roshanState.test.ts` — covers detector pure function (table-driven prev/cur → state) + Redis read/write helpers (with mocked redis)
- [ ] `shared/roshanLoot.test.ts` — covers `lookupRoshanLoot(n)` for n=0,1,2,3,4,5,99
- [ ] `server/src/routes/live.roshan.test.ts` (or extend existing live tests) — integration: full `/api/live/games` returns `match.roshan` correctly shaped for alive / dead / no-data scenarios
- [ ] `client/src/components/RoshanBlock.test.tsx` — component: renders alive/dead/no-data states, countdown ticks via vitest fake timers, last-drop row appears once `killCount >= 1`
- [ ] `.planning/phases/09-roshan-tracker/09-VALIDATION.md` — documents the manual E2E checklist (one full Roshan cycle on a live pro match)

No framework install needed — vitest already wired in both `server/` and `client/`.

### Component Test Pattern Reference
RoshanBlock tests can mirror existing component-test patterns in `client/src/hooks/useDraftDetail.test.ts` and `client/src/utils/heroUltimateMapper.test.ts`. (No prior `*.test.tsx` for components, so this will be the first — recommend planner pin a tiny @testing-library/react setup task in Wave 0 if not already present.)

**Verify before Wave 0:**
```bash
cd D:/MateProjects/projects/dota/dota_stats/client && cat package.json | grep -E '"@testing-library|jsdom"'
```
If missing, add `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` as dev deps and update `vitest.config.ts` with `environment: 'jsdom'`.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a — no user accounts in v1 |
| V3 Session Management | no | n/a |
| V4 Access Control | no | n/a — public read-only data |
| V5 Input Validation | **yes** | zod `.passthrough()` on all Valve responses; numeric matchId via `Number.isFinite()` (existing live.ts pattern lines 139-141) |
| V6 Cryptography | no | n/a — no sensitive data |
| V7 Error Handling | yes | Existing pattern: opaque 502 on upstream error, no stack traces, no API key in logs (cache.ts:21 — log err.message only) |
| V11 Business Logic | yes | Roshan detector is idempotent; concurrent invocations same matchId → same outcome (D-09 idempotency justification) |
| V13 API & Web Service | yes | Inherits from Phase 3 — no new endpoint, no new attack surface |

### Known Threat Patterns for Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Untrusted `roshan_respawn_timer` injection (Valve sends garbage) | Tampering | zod numeric coercion + `typeof === 'number'` guard in detector before arithmetic |
| Per-user Redis key explosion (DoS) | DoS | Outer cache key is per-`matchId` only (D-08); inherits Phase 5 T-5-04 pattern |
| Redis token leak in error logs | Information Disclosure | `cache.ts:21` — `console.error` logs only `err.message`, never the connection URL. Roshan helpers must follow same rule. |
| Fakemultioftransition (synthetic timer flip-flop floods Redis) | DoS | 30s outer `cached('live-games')` is the only path to Roshan logic — at most 1 write per 30s per match. Bounded. |

No new ASVS surface area beyond the existing live route. Phase 11 (Harden & Deploy) covers ratelimiting in aggregate.

## Sources

### Primary (HIGH confidence)
- `server/src/cache.ts` — Redis client init + `cached()` decorator (lines 1-83) [VERIFIED: file read]
- `server/src/routes/live.ts` — `/api/live/games` per-game enrichment shape (lines 22-115); `roshan_respawn_timer` already extracted at line 59 [VERIFIED: file read]
- `server/src/schemas/valve.ts` — `LiveGameSchema` definition; `roshan_respawn_timer` NOT yet typed (lines 80-102) [VERIFIED: file read]
- `server/src/schemas/bff.ts` — `EnrichedLiveGameSchema` extension point (entire file 14 LOC) [VERIFIED: file read]
- `client/src/components/CooldownsBlock.tsx` — client-tick `setInterval(1000)` pattern (lines 44-63) [VERIFIED: file read]
- `client/src/components/ItemsBlock.tsx` — OpenDota CDN icon URL pattern (line 51) + `onError` fallback (line 56) [VERIFIED: file read]
- `client/src/pages/MatchPage.tsx` — Right-column stack mount point (lines 130-158) [VERIFIED: file read]
- `client/src/hooks/useMatchDetail.ts` — confirms NO `/api/live/match/:id` route; data flows through `['live-games']` (lines 31-41) [VERIFIED: file read]
- `shared/items.json` — Item IDs for Aegis (117), Cheese (33), Aghs Shard (609), Aghs Blessing (271/727) [VERIFIED: grep]
- `.planning/phases/09-roshan-tracker/09-CONTEXT.md` — Locked decisions D-01..D-20 [VERIFIED: file read]

### Secondary (MEDIUM confidence)
- Liquipedia Dota 2 Wiki: [Roshan main page](https://liquipedia.net/dota2/Roshan) — current loot description (no patch attribution)
- Liquipedia Dota 2 Wiki: [Roshan/Changelogs](https://liquipedia.net/dota2/Roshan/Changelogs) — patch 7.41 changes (spawn timing only); patch 7.37 loot rework

### Tertiary (LOW confidence)
- [Hawk.live patch 7.41 article](https://hawk.live/posts/valve-released-patch-741-for-dota-2)
- [Hawk.live patch 7.37 Roshan rework article](https://hawk.live/posts/dota-2-roshan-patch-737)
- [Dota 2 Wiki - Aghanim's Blessing - Roshan](https://dota2.fandom.com/wiki/Aghanim's_Blessing_-_Roshan)

## Metadata

**Confidence breakdown:**
- Standard stack & architecture patterns: **HIGH** — all derived from verified existing files in this repo
- API field semantics (`roshan_respawn_timer`): **MEDIUM** — extracted in `live.ts:59` via cast; not formally typed; assumption A1/A2 unverified against a live payload
- Loot table for current patch: **LOW** — three sources contradict D-17 and each other; **needs user resolution before execute** (OQ-1)
- Pino logger wiring: **MEDIUM** — package present, no usage found, ~5 LOC scaffold needed (OQ-2)

**Research date:** 2026-05-03
**Valid until:** 2026-06-02 for code patterns; **immediately stale** for the loot table when next major Dota patch lands
