# Feature Landscape

**Domain:** Dota 2 live tournament match analytics (desktop web, personal/small-group)
**Researched:** 2026-04-21
**Confidence:** MEDIUM (external WebSearch/WebFetch were blocked; findings draw on training-data knowledge of Dotabuff/OpenDota/Stratz + the project's own technical brief at `.claude/work_docs/instructions_from_claude.md`. Flag for validation against current live versions of reference sites before committing to contested claims.)

## Ecosystem Context

Four reference products shape user expectations:

| Product | Role | Does Well | Gaps this project fills |
|---------|------|-----------|------------------------|
| **Dotabuff** | General stats + pro match browsing | Clean match history, hero/player pages | Live in-match state minimal; no deep real-time draft overlay |
| **OpenDota** | Open-data hub + live match list | Most comprehensive post-match data, free API | Live page is a list, not a dashboard; minimal contextual overlays |
| **Stratz** | ML-driven insights + win probability | Live match breakdown, win probability curves | Heavy, broad UI — not opinionated for "watching a single match" |
| **Broadcast overlays** (ESL/PGL/DreamLeague) | Casting-time visual overlays | Net worth graph, draft board, respawn timers | Private/proprietary; viewers don't get interactive access |

**Project niche:** Opinionated personal "live co-pilot" view that fuses watchable parts of all four, with one headline differentiator — counterpick awareness during draft that cross-references the actual opposing roster.

---

## Table Stakes

Features users expect. Missing any makes the product feel incomplete vs. reference sites.

### Home / Discovery

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| List of active tournaments | Every reference product has this; stated entry point | Low | Valve `GetLeagueListing` + OpenDota `/leagues`. Cache ~1h. |
| List of currently-live pro matches | Table-stakes on OpenDota/Stratz | Low | Valve `GetLiveLeagueGames`. Poll every 30s. |
| Team names + logos per match row | Users scan names, not match IDs | Low | `team_logo` → Steam CDN; fallback to text. |
| Series score in match list (e.g. "1-0 BO3") | Context before clicking | Low | `radiant_series_wins`/`dire_series_wins` + `series_type`. |
| Live/idle state tag | Must not click into a match to discover pre-game limbo | Low | `game_state` → Draft / In-game / Post-game. |

### Live Match Screen — Core State

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Team headers (names, logos, Radiant/Dire side) | Side changes per game; orientation matters | Low | |
| Score (kills) per team | Broadcast-overlay standard | Low | `radiant_score`/`dire_score`. |
| Net-worth / gold difference | Most-cited "who's winning" proxy | Low | Sum `net_worth` per team → signed diff. |
| Hero portraits per player (5v5 grid) | Every reference product shows this | Low | OpenDota constants → CDN. |
| Alive/dead hero status + respawn timer | Requested; broadcast-overlay standard | Low | `respawn_timer`; grayscale + countdown overlay. |
| Per-player K/D/A | On every live page | Low | Valve fields. |
| Per-player net worth + level | Broadcast-overlay + Stratz standard | Low | Valve fields. |
| Match duration (clock) | Contextualizes every other stat | Low | `duration` → MM:SS. |
| Stream delay disclosure | Users blame the tool if not surfaced | Low | Display `stream_delay_s` as "~2 min behind live". |

### Live Match Screen — Towers / Buildings

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Tower state (T1/T2/T3 per lane, each side) | Standard broadcast overlay + Stratz | Medium | `building_state` bitmask. |
| Barracks state (melee/ranged per lane, each side) | Mega creeps = dead-game signal | Medium | Same bitmask, higher-order bits. |
| Tower/rax count summary | Easier to scan than a map | Low | Derivative of decoded state. |

### Draft Screen

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Pick slots per team (5 per side) | Foundational | Low | Parse `draft.pick_0`..`pick_9`. |
| Ban slots per team | Bans are half the draft info | Low | Parse `draft.ban_0`..`ban_9`. |
| Hero portrait in each pick/ban slot | Users recognize heroes by art | Low | Constants → CDN. |
| Team currently picking/banning indicator | "Whose turn is it?" | Low | Infer from highest populated slot + CM order. |
| Empty slot placeholders | Progressive reveal needs visible empty state | Low | Grayed slot. |

### Contextual Hero Data

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Hero winrate on current patch | Core on every hero page of every reference site | Low | OpenDota `/heroStats`. Cache 6h. |
| Hero pickrate at pro level | Companion to winrate | Low | Derived from `pro_pick`. |
| Player's history on the picked hero | Used heavily on Dotabuff/OpenDota player pages | Low | OpenDota `/players/{accountId}/heroes`. Cache 15min. |

---

## Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Draft counterpick tooltip with live enemy-roster cross-reference** | **Headline differentiator.** No mainstream product fuses "counterpicks of hero X" + "does the enemy roster have players known for those counters" into one hover. | High | OpenDota `/heroes/{id}/matchups` + per-player hero history for all 5 opposing players. Pre-warm caches at first enemy pick. |
| Tournament-scoped hero winrate | Metagames differ per tournament; global WR misleads | Medium | May need Stratz GraphQL; fallback to global patch WR. |
| Player-on-hero stats inline in live UI | Reference sites require 10 tabs to analyze a draft | Medium | OpenDota `/players/{accountId}/heroes` filtered to drafted hero. |
| Win probability ribbon with trend | Stratz shows a number; a 5-sample sparkline makes trend readable | Medium | Stratz `match/{id}/breakdown`. Server-side cache shared across sessions (500/hr limit). |
| Opinionated single-screen layout | Reference sites are general dashboards; this is a focused view | Medium | No tabs, no pagination; desktop-density information design. |
| Series context panel (previous game results) | Few sites show game-1 details while game-2 is live | Medium | OpenDota `/leagues/{leagueId}/matches` filtered. |
| Graceful hidden-profile handling | Most sites show broken cells for `account_id == 4294967295` | Low | Show Valve `player.name`, skip OpenDota calls. |

### Second-tier differentiators (post-MVP)

| Feature | Value | Complexity |
|---------|-------|------------|
| Roshan respawn timer | In Valve payload; broadcast standard | Low |
| Draft pick-timer estimation | Valve doesn't expose it directly | High (approximate) |
| Pro pick/ban mini-trend in-tournament | Context for picks during draft | Medium |
| Notification when a watched match starts | Passive monitoring | Medium |

---

## Anti-Features

| Anti-Feature | Why Avoid |
|--------------|-----------|
| Public-matchmaking match support | `GetLiveLeagueGames` only covers leagues; doubles data model. Out-of-scope in `PROJECT.md`. |
| User accounts / favorites | Personal tool; auth adds friction without value. Rejected in `PROJECT.md`. |
| Mobile-responsive layout (v1) | Desktop-first is explicit; broadcast-dense UI is worse on mobile. |
| Roster change tracking | Deferred in `PROJECT.md`; doesn't improve live-match value. Link out to Liquipedia instead. |
| Post-match deep analysis / replay parsing | OpenDota's core competency. Link to `opendota.com/matches/{id}`. |
| Item/ability build recommendations | Dotabuff Hero Guides / Stratz territory. Skip; link out. |
| Betting odds integration | Legal/ToS minefield. Skip permanently. |
| Chat, comments, social features | Personal tool; scope creep; moderation burden. |
| WebSocket-based live push | Valve doesn't offer it; wrapping 30s polling adds code without reducing latency. |
| Embedded Twitch video | Distracts from data value; users already have the stream open. |
| Second-precision draft pick timer | Valve API doesn't expose it; any attempt misleads. Show state only. |
| Historical tournament dashboards | Stratz/Dotabuff do this. Value here is *right now*, not retrospectives. |

---

## Feature Dependencies

```
Home: Live-matches list
  └─> Match screen (routed by match_id)
        ├─> Core state (score, gold diff, respawn timers)
        │     └─> requires: Valve GetLiveLeagueGames poll loop + hero constants map
        ├─> Building state visualization
        │     └─> requires: building_state bitmask decoder
        ├─> Draft UI
        │     └─> requires: draft parser (pick_0..9, ban_0..9)
        │           ├─> Hero portraits       (hero constants)
        │           ├─> Hero patch winrate   (OpenDota /heroStats cache)
        │           ├─> Player-on-hero stats (OpenDota /players/{id}/heroes)
        │           │     └─> requires: account_id != 4294967295 guard
        │           └─> Counterpick tooltip  [DIFFERENTIATOR]
        │                 └─> requires BOTH:
        │                     - hero matchups        (OpenDota /heroes/{id}/matchups)
        │                     - enemy-team hero history (OpenDota /players/{id}/heroes x5)
        └─> Win probability ribbon
              └─> requires: Stratz match/{id}/breakdown (500 req/hr; server-side cache)
```

**Critical dependency notes:**

1. Hero constants map is a hard dependency of everything draft-related. Build first, cache locally, invalidate on patches.
2. Counterpick tooltip must pre-fetch opposing-roster player-heroes at first enemy pick; otherwise first hover is slow.
3. Win probability shares a cache key across all viewers — per-client polling exhausts the 500/hr Stratz quota with 2–3 concurrent sessions.
4. Tournament-scoped hero winrate may require Stratz GraphQL; degrade gracefully to global patch WR if unavailable.

---

## MVP Recommendation

### Must ship for MVP
1. Home page with live-matches list
2. Match screen: score, gold diff, K/D/A, respawn timers, hero portraits, match clock, stream-delay disclosure
3. Building state visualization (towers + barracks)
4. Draft UI: picks and bans with hero portraits
5. Hero patch winrate + player-on-hero stats on each drafted hero
6. **Counterpick tooltip with enemy-roster cross-reference** — headline differentiator
7. Graceful handling of hidden profiles and missing `building_state`

### Defer to v1.1
Series history panel, tournament-scoped hero winrate, win-probability sparkline, roshan timer, draft pick-timer estimation, pro pick/ban mini-trend.

---

## Open Questions for Phase-Specific Research

- Exact Stratz GraphQL schema for live breakdown + tournament hero WR (in case the REST `match/{id}/breakdown` path requires paid tier as of 2026).
- Whether OpenDota's `/leagues/{leagueId}/matches` is fast enough under the 50k/month quota to power a live series history panel.
- Precise scoring rule for "player is known to play this counter" — needs calibration (1 game = not "known").
- Counterpick tooltip latency: can the 5× `players/{id}/heroes` calls be batched or replaced with an OpenDota Explorer SQL query for <100ms render?
