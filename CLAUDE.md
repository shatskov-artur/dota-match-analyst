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

### Phase order

1. **Foundations** — TS scaffolds, Redis cache, zod schemas, shared primitives (no UI)
2. **Live Matches List** — Home page with live pro matches, auto-refresh 30s
3. **Match Core** — Score, gold diff, hero grid, towers/rax, K/D/A
4. **Draft UX** — Picks/bans with 5s polling, whose-turn indicator
5. **Hero & Player Intel** — Patch winrate, counterpick tooltip, player stats
6. **Win Probability** — Stratz bar, degrades gracefully
7. **Harden & Deploy** — Rate limits, error boundaries, Vercel + Railway

## Tech Stack

- **Frontend:** React 19 + Vite 6 + TypeScript + Tailwind 4 + TanStack Query v5 + React Router v7
- **Backend:** Node.js 24 LTS + Hono 4 + ioredis 5 + zod 3 + pino 9
- **Cache:** Upstash Redis (serverless)
- **Deploy:** Vercel (frontend) + Railway (backend)
- **APIs:** Valve Web API, OpenDota API, Stratz API

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
