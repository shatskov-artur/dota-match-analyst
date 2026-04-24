# Research Summary — Dota 2 Real-Time Tournament Match Analytics

**Synthesized:** 2026-04-22
**Overall confidence:** HIGH on stack + architecture + pitfalls; MEDIUM on feature nuance.

## Executive Summary

This is a desktop-first "live co-pilot" dashboard for pro Dota 2 matches — an opinionated fusion of the watchable parts of Dotabuff, OpenDota, Stratz, and broadcast overlays. Architecturally it is a **client → BFF → cache → upstream APIs** pipeline: a React SPA polls a thin Node.js aggregator which fans out to Valve, OpenDota, and Stratz, with Redis as the rate-limit firewall.

The originally proposed stack (React 18 + Vite + Express + Redis) is directionally correct but needs three upgrades: **TypeScript end-to-end** (non-negotiable given ~50-field nested Valve payloads), **Hono in place of Express** (faster, TS-native), and **React 19 + Tailwind 4**. Risks are concentrated in rate limits (Stratz 500/hr is the binding constraint) and API drift. Mitigation: zod schemas with `.passthrough()` at every API boundary, shared server-side caches keyed only by data's variance axes (never per-user), and Stratz wrapped in `Promise.allSettled` so win-probability failure never crashes the match page.

---

## 1. Recommended Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 19.2.x + Vite 6.x + TypeScript 5.6.x |
| Styling | Tailwind CSS 4.1.x (CSS-first, no PostCSS) |
| Server state + polling | @tanstack/react-query 5.x |
| Routing | react-router 7.x (declarative mode) |
| UI-only state | zustand 5.x |
| Backend runtime | Node.js 24 LTS + TypeScript |
| HTTP framework | Hono 4.x + @hono/node-server (replaces Express) |
| Redis client | ioredis 5.x |
| Validation | zod 3.x (parse every external API response) |
| Logging | pino 9.x |
| Testing | vitest 2.x |
| Dev runner | tsx (replaces ts-node + nodemon) |
| Cache | Upstash Redis (serverless HTTPS, free tier) |
| Deploy | Vercel (frontend) + Railway $5/mo (backend) |

**Excluded:** Express 5, axios, node-cron, Redux, Next.js, tRPC, Prisma/Drizzle, WebSockets, Jest.

---

## 2. Table Stakes vs. Headline Differentiator

### Must ship for MVP
1. Home page: active tournaments + live matches, team names, series score, live/idle tag
2. Match screen: team headers, score, gold diff, 5v5 hero grid, K/D/A, net worth, respawn timers, match clock, stream-delay disclosure
3. Building state: towers + barracks visualization (decoded from `building_state` bitmask)
4. Draft UI: picks + bans per team with hero portraits and "whose turn" indicator
5. Hero patch winrate + pro pickrate on drafted heroes
6. Per-player history on their picked hero
7. Graceful hidden-profile handling (`account_id === 4294967295`)

### Headline differentiator
**Counterpick tooltip with live enemy-roster cross-reference** — on hover, show this hero's counters AND flag any counters that opposing players are "known to play" (from their OpenDota player-hero history). No mainstream product fuses these two datasets into one hover. This is the reason to build the tool rather than embedding OpenDota /live.

### Deferred to v1.1
Win-probability sparkline, tournament-scoped hero WR, series history panel, Roshan timer, pick-timer estimation.

---

## 3. Architecture Shape

A thin Hono BFF fronts three external APIs and exposes 5-6 aggregation endpoints. Every upstream call is wrapped in a `cached()` decorator keyed by data type + variance axes only (never per-user), so N concurrent viewers of the same match produce exactly **one** upstream call per TTL. The React SPA uses TanStack Query with a dynamic `refetchInterval` tied to `game_state` (5s draft, 30s in-game, `false` post-game). Stratz is always optional, typed as `value | null`, never crashing the page.

---

## 4. Top 5 Pitfalls

| # | Pitfall | Prevention | Phase |
|---|---------|------------|-------|
| 1 | **Stratz 500 req/hr exhausts with multiple viewers** | Cache server-side by `match_id` only — one entry per match, not per user. Treat as optional. | P6 |
| 2 | **account_id = 4294967295 = hidden profile** — OpenDota calls break | Short-circuit at aggregator. Return `{hidden: true, stats: null}`. Use Valve's `player.name`. | P2/P5 |
| 3 | **building_state can be 0 or absent** — towers falsely show alive | Check field presence before decoding. Show "data unavailable" placeholder. | P2 |
| 4 | **Polling continues on finished matches** — quota drain | `refetchInterval` returns `false` on `game_state === 6`. | P3 |
| 5 | **Valve silently adds fields in patches** — zod rejects valid data | Use `.passthrough()` on all Valve schemas. Validate only used fields. | P0 |

---

## 5. Build Order

Linear through P3, then P4/P5/P6 are parallelizable.

| Phase | Name | Deliverable |
|-------|------|-------------|
| **P0** | Foundations | Repo, TS scaffolds, Redis, `.gitignore`, `heroMapper`, `buildingDecoder`, `cached()` decorator, zod pattern |
| **P1** | Live List | Home page with live tournament matches, auto-refresh 30s |
| **P2** | Match Core | Score, gold diff, K/D/A, respawn timers, match clock, towers/rax, stream-delay disclosure |
| **P3** | Draft UX | Picks + bans live at 5s, whose-turn indicator, hero portraits |
| **P4** | Hero Intel ★ | Counterpick tooltip (differentiator) + hero patch winrate |
| **P5** | Player Intel | Per-player hero stats inline in match screen |
| **P6** | Win Probability | Stratz bar with >5min gate, server-side shared cache |
| **P7** | Harden & Deploy | Rate-limit queues, error boundaries, 429 backoff, Vercel + Railway |

**Critical path to "user sees a live match":** P0 → P1 → P2.

---

## 6. Open Questions Before Starting

1. **Stratz 2026 access model** — Is REST `/match/:id/breakdown` still free, or paid/GraphQL-only? Verify before P6.
2. **Counterpick "known to play" threshold** — What counts as "known"? Suggest: ≥5 games AND >50% pickrate in last 3 months. Needs calibration before P4.
3. **Counterpick tooltip latency** — Can 5× `/players/:id/heroes` parallelize to <100ms? Or need OpenDota Explorer SQL query?
4. **TanStack Query v5 dynamic `refetchInterval` API** — Signature changed from v4. Confirm before writing `useLiveMatch`.
5. **Stream delay** — Is `stream_delay_s = 120` still the default in 2026?
