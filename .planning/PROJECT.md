# Dota 2 Match Analyst

## What This Is

A personal web tool for watching and analyzing Dota 2 tournament matches in real-time. It surfaces live draft stats (bans/picks, timers), in-game state (hero alive/dead, gold diff, kills, towers, win probability), and contextual analytics (hero patch winrate, player stats on heroes, counterpick tooltips during draft). Built for the owner and a small group of friends.

## Core Value

You open a live match and instantly understand who's winning and why — from the draft phase through the final push.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can browse active tournaments and live matches on the home page
- [ ] User can navigate into a live match and see real-time in-game stats (kills, gold diff, towers, barracks, win probability)
- [ ] User can see draft phase details: which heroes are being banned/picked per team
- [ ] User can see each hero's alive/dead status with respawn timer during the game
- [ ] User can see the current series score (e.g. 1-0 in a Bo3) and previous game outcomes
- [ ] User can hover a hero during the draft to see its top counterpicks and flag if enemy team has players known to play those counters
- [ ] User can see a hero's current patch winrate and pro pickrate
- [ ] User can see a specific player's stats on a hero: picks, wins, winrate, and that hero's winrate in this tournament

### Out of Scope

- Roster change tracking — deferred to v2; adds data complexity without improving core live-match value
- User accounts / authentication — personal + small group tool; simple deployment without auth is fine for v1
- Non-tournament (public matchmaking) matches — Valve's `GetLiveLeagueGames` only covers league matches; scope is intentionally pro-scene only
- Mobile-optimized layout — desktop-first for v1

## Context

- Claude previously wrote a comprehensive technical guide (`.claude/work_docs/instructions_from_claude.md`) covering all API endpoints, response structures, caching strategy, and component code — this is the primary implementation reference.
- Three external APIs are in play: Valve Web API (live match data, 100k req/day), OpenDota API (hero stats, player history, counterpicks), Stratz API (win probability via ML, 500 req/hr).
- Valve's live API has a 2-minute stream delay baked in — this is expected and should be shown to the user.
- Players with hidden Steam profiles (account_id = 4294967295) must be handled gracefully — show name from live API, skip OpenDota lookups.
- `building_state` is a 32-bit bitmask — decoding logic already documented.
- Redis is used for caching with per-data-type TTLs: live data 30s, hero stats 6h, player stats 15min.

## Constraints

- **APIs**: Free tiers only — OpenDota 50k req/month, Stratz 500 req/hour, Valve 100k req/day. Aggressive caching is non-negotiable.
- **Tech Stack**: React 18 + Vite + Tailwind (frontend), Node.js + Express (backend), Redis (cache) — already decided in the technical guide.
- **Data freshness**: Valve API doesn't support WebSocket — polling is required. Draft phase: 5s, in-game: 30s.
- **Scope**: Pro tournament matches only (league_id required). No casual match support.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node.js + Express for backend | Simpler than FastAPI for this use case; JS throughout the stack | — Pending |
| Redis for caching | Prevents API rate-limit exhaustion across all three providers | — Pending |
| React Query for frontend polling | Built-in refetchInterval, stale-time, and deduplication | — Pending |
| Polling over WebSocket | Valve API doesn't offer WebSocket for live data | — Pending |
| No auth for v1 | Small group, private deployment — auth adds friction without value | — Pending |

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
*Last updated: 2026-04-21 after initialization*
