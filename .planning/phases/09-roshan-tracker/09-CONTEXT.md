# Phase 9: Roshan Tracker - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Server-side Roshan kill counter inferred from `scoreboard.roshan_respawn_timer` transitions (0 → >0), persisted in Redis per `match_id`, surfaced as a compact UI block showing: next-kill number, expected loot, respawn countdown (when dead), and last-kill loot history. Strictly tied to the live BFF poll cycle — no background poller, no OpenDota live parsing.

</domain>

<decisions>
## Implementation Decisions

### Detection Logic
- **D-01:** Pure transition detector — compare `prevTimer` (Redis) to `curTimer` (current scoreboard). If `prev === 0 && cur > 0` → increment kill counter. No external fallbacks (no OpenDota match parse for live).
- **D-02:** No duration validation gate (e.g., `cur >= 300`) — keep detector minimal; Valve has not exhibited the false-reset pattern in prior phases. Revisit only if observed in production.
- **D-03:** Match boundary = `match_id`. Each match gets its own Redis key. No `game_state` reset logic — Valve issues a new `match_id` per match.
- **D-04:** Bootstrap on mid-match join: if first observed `timer > 0` and no prior Redis state, initialize `killCount = 1` (we know at least one kill happened). Trade-off accepted: undercount if we joined after kill 2+.
- **D-05:** Pino `logger.info({ matchId, killNumber, prevTimer, curTimer }, 'roshan kill detected')` on every inferred increment. Roshan kills are rare (~3-5/match), no log spam.

### Redis Schema
- **D-06:** Key: `roshan:{matchId}`. Value: JSON blob `{ killCount: number, prevTimer: number, kills: Array<{ n: number, gameTime: number, timestamp: number }> }`.
- **D-07:** TTL: 6 hours. Covers longest matches + post-game viewing window. No explicit cleanup logic.
- **D-08:** Writer: inline inside the `GET /api/live/match/:id` BFF handler. Read prev state → compare → conditionally write. Lives alongside the existing `cached('live-games', 30s)` decorator. The 30s outer cache means this transition check runs at most once per 30s per match — race conditions are non-issue (idempotent: `prev === cur` short-circuits the increment).
- **D-09:** No Lua / no atomic CAS. Idempotency from D-08 is sufficient.

### UI / Layout
- **D-10:** Mount RoshanBlock inside the existing right-column stack on MatchPage: `[DotaMapView, RoshanBlock, CooldownsBlock]` — width 320px column. **Do NOT add new columns or restructure the in-game row.**
- **D-11:** Alive state — compact: header `ROSHAN #N` (next kill number) + horizontal row of loot icons for that kill.
- **D-12:** Dead state — large monospace `mm:ss` countdown centered + `RESPAWN` label above + dimmed icons of next-kill loot below.
- **D-13:** Last-kill loot — small `LAST DROP:` row at the bottom of the block (always present once `killCount >= 1`). Same icon style, smaller scale.
- **D-14:** Countdown ticks **client-side every 1s** via `useEffect setInterval` (consistent with CooldownsBlock per project memory). Backend poll every 30s resyncs drift.

### Loot Table
- **D-15:** Source: TS constant `ROSHAN_LOOT: Record<number, ItemId[]>` in `shared/roshanLoot.ts`. Item IDs reuse `itemMapper` types from Phase 7.
- **D-16:** Patch versioning: `const ROSHAN_LOOT_PATCH = '7.41' as const` + header comment `// VERIFIED: patch 7.41 (2026-04-26)`. Grep-friendly when patch updates.
- **D-17:** Patch table (verified 2026-05-03 via Liquipedia /Roshan; resolves research OQ-1):
  - Kill 1: Aegis (id 117)
  - Kill 2: Aegis + Roshan's Banner (id 1804)
  - Kill 3+: Aegis + Roshan's Banner + Cheese (id 33) + Refresher Shard (id 260)
  - **Source of truth:** https://liquipedia.net/dota2/Roshan §"Consumable Drops"
  - **Note:** Earlier draft of D-17 listed Aghanim's Shard/Blessing — that was a pre-7.37 table. Liquipedia and Hawk.live both confirm the above for the current patch.

### Icons / Assets
- **D-18:** Icons via OpenDota CDN: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/{name}.png` — same source as ItemsBlock (Phase 7). No local assets. Resolved item slugs: `aegis`, `roshans_banner`, `cheese`, `refresher_shard`.

### Logging
- **D-21:** (resolves research OQ-2) Scaffold `server/src/logger.ts` with `import pino from 'pino'; export const logger = pino({...})` in this phase. ~5 LOC. D-05 uses this logger directly.

### API Shape
- **D-19:** Surface roshan state inside the existing match-detail response: `match.roshan: { killCount: number, alive: boolean, respawnIn: number | null, lastKillLoot: ItemId[] | null }`. No new endpoint, no extra round-trip.
- **D-20:** Computed in BFF after Redis read/write — client just renders.

### Claude's Discretion
- Exact spacing / typography of RoshanBlock (within MatchPage palette: `#0a0a0a` bg, `#d8d8d8` text, accent `#b03030`).
- Internal naming of helpers (`detectRoshanKill`, `roshanState`, etc.).
- Whether `kills[]` history is hydrated to client now or deferred (D-19 currently doesn't expose full history; client only needs `lastKillLoot`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/ROADMAP.md` §"Phase 9: Roshan Tracker" — goal, API reality, success criteria, VERIFY notes
- `.planning/REQUIREMENTS.md` — Roshan respawn timer listed under in-scope analytics

### Prior Phase Patterns (carry forward)
- `.planning/phases/03-match-core/03-CONTEXT.md` — match-detail BFF route, polling cadence, hidden profile guard
- `.planning/phases/05-hero-player-intel/05-CONTEXT.md` — outer cache key pattern (`{type}:{matchId}`, T-5-04 DoS mitigation)
- `.planning/phases/07-in-game-item-intel/07-CONTEXT.md` — itemMapper, OpenDota CDN icon URL pattern
- `.planning/phases/08-ability-cooldowns-map/08-CONTEXT.md` — client-tick `setInterval(1000)` pattern, right-stack layout

### Code (read before changing)
- `client/src/pages/MatchPage.tsx` — in-game row composition; right column structure (lines 130–158)
- `client/src/components/CooldownsBlock.tsx` — client-tick reference implementation
- `client/src/components/DotaMapView.tsx` — sibling in right stack

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `shared/itemMapper` (Phase 7): item id → name + icon URL — reuse for loot icons.
- `client/src/components/CooldownsBlock.tsx`: client-tick `setInterval` pattern + visual style template for RoshanBlock.
- `client/src/components/ItemsBlock.tsx`: OpenDota CDN icon rendering pattern.
- `useMatchDetail` hook: dynamic `refetchInterval` already wired (30s in-game, false post-game) — RoshanBlock inherits the same poll cadence by reading from `match.roshan`.
- `cached()` decorator: BFF Redis caching primitive — Roshan logic runs inside the cached match-detail handler, no new caching layer.

### Established Patterns
- Server-side state per `match_id` keyed in Redis with TTL — same as Phase 7 itemSnapshot, Phase 8 cooldowns.
- Polling cadence by `game_state`: 30s when in-game (5), false otherwise.
- Client tickers (`setInterval(1000)`) for any time-based countdown — overrides "no client clock" pitfalls per project memory.

### Integration Points
- BFF: `server/src/routes/live.ts` (or wherever match-detail handler lives) — add roshan-state read/compare/write before composing the response.
- Client: `client/src/pages/MatchPage.tsx` line ~130 — insert `<RoshanBlock>` between `<DotaMapView>` and `<CooldownsBlock>` in the right column stack.
- Shared: new `shared/roshanLoot.ts` constant + types.
- New zod schema for `match.roshan` field in match-detail response.

</code_context>

<specifics>
## Specific Ideas

- Visual reference: CooldownsBlock layout & color palette — RoshanBlock should feel like a sibling, not a foreign widget.
- Layout preservation rule (project memory): do NOT silently restructure the existing in-game row layout. Insertion only.
- "Roshan #N" wording = the **next** kill number (the one whose loot is being shown), not the count of past kills. (E.g., after 2 kills, header shows `ROSHAN #3`.)

</specifics>

<deferred>
## Deferred Ideas

- **Aegis pickup detection** — Valve live API does not expose aegis ownership; would need OpenDota live parse (not available in real-time). Skipped.
- **Aegis 5-min reclaim countdown** — depends on pickup detection, deferred with it.
- **Tormentor tracker** — out of scope per ROADMAP.
- **Roshan history in match recap (post-game)** — `kills[]` array already stored in Redis per D-06; can surface in a future phase without schema change.
- **Tooltip-on-hover for full kill history** — chose simpler "LAST DROP" row instead.

</deferred>

---

*Phase: 09-roshan-tracker*
*Context gathered: 2026-05-03*
</content>
</invoke>