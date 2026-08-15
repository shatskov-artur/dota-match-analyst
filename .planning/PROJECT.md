# Dota 2 Match Analyst

## What This Is

A personal web tool for watching and analyzing Dota 2 tournament matches in real-time. It surfaces live draft stats (bans/picks, timers), in-game state (hero alive/dead, gold diff, kills, towers, win probability), and contextual analytics (hero patch winrate, player stats on heroes, counterpick tooltips during draft). Built for the owner and a small group of friends.

**Where it actually stands (2026-08-11).** The tool is built and runs locally against live data. What
is *published* is a static replay of a recorded tournament session (Phase 12) — the live service is
deliberately switched off, so nobody but the owner can currently watch a live match with it. That is
a real divergence from the sentence above, and resolving it is the open v1.1 question in Active
below, not something this document should paper over.

## Core Value

You open a live match and instantly understand who's winning and why — from the draft phase through the final push.

## Requirements

### Validated

Delivered and exercised against live tournament data (ids and phase mapping in REQUIREMENTS.md):

- [x] Browse live matches on the home page, filtered by tournament / status / team search
- [x] Open a match and see real-time in-game stats — kills, gold diff, towers, barracks, win probability
- [x] See draft picks and bans per team updating every ~5s, with a whose-turn indicator
- [x] See each hero's alive/dead status with a respawn timer
- [x] See the current series score, plus a disclosure that live data lags ~2 minutes
- [x] Hover a drafted hero for its top counterpicks, flagged when an opposing player is known to play them
- [x] See a hero's current patch winrate and pro pick count
- [x] See a player's record on the hero they are piloting
- [x] Read items, ultimate cooldowns, hero positions, Roshan state and gold/XP history for a live match
- [x] Recognise teams by their logo, with an initials monogram when none exists

### Active

- [ ] **Decide what v1.1 is** — restart the live service (which needs per-IP limiting and a shared
      token before the BFF is public again), or accept the static demo as the finished artifact and
      keep the live path as documentation. Most decisions below hang on this answer.
- [ ] Run both test suites in CI — the only workflow today builds and publishes the demo, so a
      broken suite reaches the published page unnoticed

### Delivered differently from the original wording

- "Previous game outcomes" in a series: only the current score ships; the series history panel is v2
- "That hero's winrate in this tournament": ships as global patch stats, not tournament-scoped; v2
- Counterpick matchups come from Stratz, not OpenDota (changed in Phase 6)

### Out of Scope

- Roster change tracking — deferred to v2; adds data complexity without improving core live-match value
- User accounts / authentication — personal + small group tool; simple deployment without auth was fine for v1. **Revisit if the live service returns**: the BFF proxies personal Valve and Stratz keys with no per-IP limit.
- Non-tournament (public matchmaking) matches — Valve's `GetLiveLeagueGames` only covers league matches; scope is intentionally pro-scene only
- ~~Mobile-optimized layout — desktop-first for v1~~ → **moved into scope 2026-06-06**, delivered in Phase 10.4 (UI-02/UI-03)

## Context

- Claude previously wrote a comprehensive technical guide (`.claude/work_docs/instructions_from_claude.md`) covering all API endpoints, response structures, caching strategy, and component code — this is the primary implementation reference.
- Three external APIs are in play: Valve Web API (live match data, 100k req/day), OpenDota API (hero stats, player history, counterpicks), Stratz API (win probability via ML, 500 req/hr).
- Valve's live API has a 2-minute stream delay baked in — this is expected and should be shown to the user.
- Players with hidden Steam profiles (account_id = 4294967295) must be handled gracefully — show name from live API, skip OpenDota lookups.
- `building_state` is a 32-bit bitmask — decoding logic already documented.
- Redis is used for caching with per-data-type TTLs: live data 30s, hero stats 6h, player stats 15min.

## Constraints

- **APIs**: Free tiers only — OpenDota 50k req/month, Stratz 500 req/hour, Valve 100k req/day. Aggressive caching is non-negotiable.
- **Tech Stack** (as built, 2026-08-11): React 19 + Vite 6 + Tailwind 4 + TanStack Query v5 + React Router v7 + zustand (frontend); Node 24 + **Hono 4** + zod + pino + p-queue/p-retry (BFF); Upstash Redis (cache). _The original constraint said React 18 + Express; Express was replaced by Hono in Phase 1 and never reflected here._
- **Data freshness**: Valve API doesn't support WebSocket — polling is required. Draft phase: 5s, in-game: 30s.
- **Scope**: Pro tournament matches only (league_id required). No casual match support.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| ~~Node.js + Express for backend~~ → **Hono 4** | Express was the plan; Hono shipped in Phase 1 — lighter, typed routing, same JS-throughout argument | Reversed in Phase 1 |
| Redis for caching | Prevents API rate-limit exhaustion across all three providers | Held — `cached()` is the only path upstream; N viewers = 1 call per TTL |
| React Query for frontend polling | Built-in refetchInterval, stale-time, and deduplication | Held — dynamic intervals per game state (5s draft / 30s in-game / stop at post-game) |
| Polling over WebSocket | Valve API doesn't offer WebSocket for live data | Held |
| No auth for v1 | Small group, private deployment — auth adds friction without value | Held, but it is what makes restarting the public BFF costly — see Active |
| Stratz for counterpick matchups (Phase 6) | Pro-bracket data beats OpenDota's all-bracket matchups for a pro-scene tool | Held, with a cost: no Stratz token → no counterpicks |
| Win probability as three bars (Phase 6) | Stratz returns null for all but major tournaments, so a Stratz-only bar was invisible in ~95% of matches | Held — Stratz + gold + heuristic, each labelled |
| Public artifact = static replay (Phase 12) | Running the live service spends quota and parks personal keys on a host | Held — see the v1.1 question in Active |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-11 — reconciled against the codebase. The stack, the validated
requirements, the mobile-scope reversal and every "Pending" decision outcome had drifted from what
is actually built.*
