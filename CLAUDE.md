# Dota 2 Match Analyst

## Project

Real-time Dota 2 tournament match analytics web app for a small group. Built with React 19 + Vite + TypeScript (frontend) and Node.js 24 + Hono + Redis (backend). Data from Valve Web API, OpenDota API, and Stratz API.

## GSD Workflow

This project uses the GSD (Get Shit Done) workflow system.

**Current state:** `.planning/STATE.md`
**Roadmap:** `.planning/ROADMAP.md`
**Requirements:** `.planning/REQUIREMENTS.md`

### Commands

- `/gsd-discuss-phase 1` — discuss Phase 1 before planning
- `/gsd-plan-phase 1` — create an execution plan for a phase
- `/gsd-execute-phase 1` — execute a planned phase
- `/gsd-progress` — view overall progress

### Phases (all complete — see ROADMAP.md)

1. **Foundations** — TS scaffolds, Redis cache, zod schemas, shared primitives (no UI)
2. **Live Matches List** — Home page with live pro matches, auto-refresh 30s
3. **Match Core** — Score, gold diff, hero grid, towers/rax, K/D/A
4. **Draft UX** — Picks/bans with 5s polling, whose-turn indicator
5. **Hero & Player Intel** — Patch winrate, counterpick tooltip, player stats
6. **Win Probability** — three bars: Stratz + gold + heuristic estimate
7. **In-Game Item Intel** — heroes by net worth with item slots
8. **Ability Cooldowns & Map** — ultimates on cooldown, hero positions on the minimap
9. **Roshan Tracker** — kill counter in Redis, loot by kill number, respawn countdown
10. **Historical Graphs** (+10.1–10.3) — gold/XP lead charts, background sampler, layout restructure
10.4/10.5. **Redesign + responsive** — responsive breakpoints, then the Neon Bento skin that ships
11. **Harden & Deploy** — rate-limit queues, error boundaries, Vercel + Railway config
12. **Snapshot Demo** — recorded replay on GitHub Pages; **this is the public artifact, the live service is off**
13. **Team Avatars** — server-resolved team logos with a monogram fallback

### v2.0 — Tournament archive (local-only)

Turns the app from "what is happening now" into a recorded tournament archive.

- **Postgres archive** (`server/src/db/`) — per-minute snapshots, series, bracket, events, analysis
- **One background tick** `services/ingest/ingestJob.ts` (30s) replaces the old `historySamplerJob`:
  snapshots every tracked live match, syncs the bracket every 5 min, backfills finished
  matches from OpenDota every 10 min
- **Time travel** — `/api/matches/:id/at?minute=N` replays the exact payload the BFF served
  then, so `MatchPage` renders an archived minute with no component changes. With no live
  snapshot behind it (nobody watched the game), `services/archive/reconstruct.ts` rebuilds
  the same shape from `player_timeline` + `match_timeline` + the event log — heroes, net
  worth, level, last hits, K/D, score and building state. Items, cooldowns, map positions,
  denies and assists exist only in a live recording; the response sets `reconstructed: true`
  and the page says so rather than leaving three panels blank
- **Series tabs, bracket, schedule** from Valve's keyless `GetLeagueData`
- **Two independent ways to discover a played match** — Valve's `nodes[].matches[]` and
  OpenDota's `/leagues/{id}/matches`. The second exists for the overnight case: the machine
  was off, the sampler saw nothing, and backfill can only fill rows that already exist.
  OpenDota also carries `series_id`/`series_type`, so the Game 1/2/3 tabs survive a
  tournament that never publishes a match id
- **Head-to-head** — recent form and previous meetings from OpenDota's keyless team history
- **Match event log** — kills, objectives and teamfights, each timestamped and clickable.
  Live it is counter diffing at 30s (victim known, killer not); after the replay is parsed
  OpenDota's exact kill log supersedes it and the coarse rows are hidden
- **Key moments** — turning points, laning verdict, objective impact (`services/analysis/`)

Runs entirely on the local machine; nothing is published. `npm run pg:start --prefix server`
starts an embedded Postgres on **:55432** (the machine already runs a system Postgres on 5432).

## Tech Stack

- **Frontend:** React 19 + Vite 6 + TypeScript + Tailwind 4 + TanStack Query v5 + React Router v7 + zustand
- **Backend:** Node.js 24 LTS + Hono 4 + ioredis 5 + zod 3 + pino 9 + Drizzle ORM + postgres-js
- **Cache:** Upstash Redis (or local Redis via `REDIS_URL`)
- **Archive:** Postgres 18 (embedded locally, `docker-compose.local.yml` as the Docker alternative)
- **Deploy:** Vercel (frontend) + Railway (backend) — config retained, service intentionally off
- **APIs:** Valve Web API, `www.dota2.com/webapi` (keyless league data), OpenDota API, Stratz API

## Key Patterns

- TypeScript + zod everywhere — parse every external API response with `.passthrough()`
- `cached()` decorator wraps all upstream calls — N viewers = 1 upstream call per TTL
- Dynamic `refetchInterval`: 5s draft, 30s in-game, `false` post-game
- Stratz is always optional — wrapped in `Promise.allSettled`, typed as `value | null`
- Hidden profiles (`account_id === 4294967295`) short-circuit at aggregator, never crash UI

## Auto-loaded skills

- **Sketch findings for dota_stats** (design decisions, CSS patterns, visual direction) → `Skill("sketch-findings-dota-stats")`

## Critical Pitfalls

- `building_state` can be absent — always check before decoding bitmask
- Stratz 500 req/hr — cache server-side by `match_id` only, never per-user
- Polling must stop on `game_state === 6` — finished matches drain quota
- Use `.passthrough()` on all Valve zod schemas — new fields silently added each patch
- OpenDota answers **200 with an empty body** (not 404) for unknown ids — parse defensively and treat it as a cacheable miss, or every unknown id re-fetches on every poll
- Valve's `team_logo` ugcid exceeds `Number.MAX_SAFE_INTEGER` — `JSON.parse` corrupts it before you see it; resolve logos by `team_id` via OpenDota instead

### v2.0 pitfalls (all hit for real during Phase A–F)

- `tower_state` / `barracks_state` live **per team** under `scoreboard.{radiant,dire}`; the top level is `undefined`. `liveAggregator` packs them into the layout `buildingDecoder` expects — do not read the raw top-level fields
- The archive database **must be UTF8**. `initdb` inherits the Windows locale (WIN1250 here) and then rejects Cyrillic player names with `has no equivalent in encoding "WIN1250"`
- Valve pads a bracket group's `team_standings` with placeholder rows (`team_id: 0`). Duplicate keys in one INSERT make Postgres fail with *"ON CONFLICT DO UPDATE cannot affect row a second time"* — filter and de-duplicate every batch
- TI 2026 shipped an **empty `series_infos`** until the first game and filled it afterwards; the same ids also arrive in `nodes[].matches[]`. Support both paths, never one
- Valve **changes the JSON type of ids mid-tournament**: `series_infos[].match_ids` were numbers while the array was empty and became strings with the first game played. One bad element fails the whole payload, so `getLeagueData` returns null and the bracket silently freezes on pre-tournament data. Every id field in `schemas/leagueData.ts` goes through the tolerant `id` union — do not add a bare `z.number()` id
- OpenDota's `radiant_win` describes the **side**, not the team — pivot on `radiant` before calling a row a win
- Outside the top tier, one organisation is registered under **several team ids**; head-to-head falls back to matching on team name and labels the result
- `TRACKED_LEAGUE_IDS` is never hardcoded — resolve it with `npm run find:league`
- **A series score has three copies and they drift**: `bracket_nodes.team_N_wins` and `series.team_N_wins` are both Valve's, updated by different sync paths at different moments, and `matches.radiant_win` is what actually happened. Reading any one of them directly is how the schedule said "1-0, live" about a series the match page already showed as 2-0. Every route that shows a score goes through `services/archive/seriesScore.ts` — count the maps, keep whichever source is further ahead per team (both under-report, neither over-reports), and treat a mathematically decided series as finished whatever the node's flags say
- Schedules are synced for every live league, but a **match row is a unit of work** — it enters the backfill queue and costs an OpenDota fetch. Community leagues publish their whole history in `GetLeagueData`, so stubbing untracked leagues queued 21,000 matches and starved TI's own. Only tracked leagues get match rows; `npm run db:prune` clears strays (empty rows only — anything with snapshots, timeline or events is kept)
