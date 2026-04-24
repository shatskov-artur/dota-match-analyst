# Technology Stack

**Project:** Dota 2 Real-Time Tournament Match Analytics (personal + small group tool)
**Researched:** 2026-04-21
**Overall confidence:** HIGH (core choices verified against official sources); MEDIUM on minor library picks
**Mode:** Ecosystem validation of existing proposal in `.claude/work_docs/instructions_from_claude.md`

---

## TL;DR — Prescriptive Stack

**Frontend:** React 19 + Vite 6 + TypeScript 5.6 + Tailwind v4 + TanStack Query v5 + React Router v7 + Zustand 5
**Backend:** Node.js 24 LTS + Hono 4 + TypeScript + ioredis 5 + zod 3 + pino 9
**Cache:** Upstash Redis (serverless, free tier)
**Deploy:** Vercel (frontend) + Railway (backend) + Upstash (Redis)
**Language:** TypeScript end-to-end

**Biggest correction to the existing proposal:** use **TypeScript + Hono**, not plain JavaScript + Express. Valve/OpenDota return deeply nested responses where static typing pays for itself within 2 hours of writing the first service. Hono is faster, first-class on serverless, and has a smaller API surface than Express 5.

---

## Validation of Existing Proposal

| Existing Proposal | Verdict | Reasoning |
|---|---|---|
| React 18 + Vite | **Upgrade to React 19** | React 19 stable since Dec 2024; 19.2 released Oct 2025. No reason to start greenfield on 18. |
| Tailwind CSS | **Keep — upgrade to v4** | v4.0 released Jan 2025, v4.1 Apr 2025. Config-less, CSS-first, ~5x faster build. |
| Node.js + Express | **Replace Express with Hono** | Faster, smaller, TypeScript-native, runtime-portable. Express 5 works but is legacy at this point. |
| Python + FastAPI (alt) | **Reject** | Splits language boundary for no benefit. Keep JS throughout. |
| Redis | **Keep — use Upstash** | Redis is correct. Upstash (serverless HTTP Redis) beats self-hosted for this deployment profile. |
| React Query | **Keep — @tanstack/react-query v5** | `refetchInterval` is purpose-built for polling. No alternative comes close. |
| axios | **Replace with native `fetch`** | Node 24 and modern browsers have stable `fetch`. axios adds 13kB and a redundant promise layer. |
| node-cron | **Remove** | Polling is driven by TanStack Query on the client; backend just proxies + caches. No cron needed for v1. |
| Deployment: Docker + VPS | **Use Vercel + Railway + Upstash** | PaaS = zero ops. Keep Docker Compose for local dev only. |
| Plain JavaScript | **Switch to TypeScript** | Non-negotiable for a project parsing 3 external APIs with ~50 field match objects. |
| No validation layer | **Add zod** | Parse every external response through a zod schema. Catches Valve API drift at the seam, not in UI code. |

---

## Recommended Stack

### Core Frontend

| Technology | Version | Purpose | Why |
|---|---|---|---|
| React | **19.2.x** | UI framework | Stable since Dec 2024. New hooks useful even for this app. **HIGH confidence — verified on react.dev blog.** |
| Vite | **6.x** | Dev server + bundler | 10-100x faster HMR. Native ESM. Default for new React projects in 2025. |
| TypeScript | **5.6.x** | Type safety | Catches `building_state` decoding bugs, hero ID mismatches, and `account_id = 4294967295` sentinel at compile time. |
| Tailwind CSS | **4.1.x** | Styling | CSS-first config (`@theme` in CSS). No PostCSS needed. **HIGH confidence — verified on tailwindcss.com/blog.** |
| @tanstack/react-query | **5.x** | Server state + polling | `refetchInterval` is the exact primitive needed. Built-in request deduplication. |
| react-router | **7.x** | Client routing | For this 3-route SPA use "declarative" mode only. |
| zustand | **5.x** | Client-only state | UI state only (selected match, hovered hero). Do NOT use for server data. |

### Core Backend

| Technology | Version | Purpose | Why |
|---|---|---|---|
| Node.js | **24 LTS** | Runtime | Current LTS since May 2025. Native `fetch`, native test runner. **HIGH confidence — verified on nodejs.org.** |
| TypeScript | **5.6.x** | Type safety | Share types between front/back via `shared/types.ts`. |
| Hono | **4.x** | HTTP framework | Faster than Express, smaller API, TypeScript-first, runs on Node/Bun/Vercel Edge. Zero-config CORS. |
| ioredis | **5.x** | Redis client | Battle-tested, supports TLS (needed for Upstash), cluster-aware. |
| zod | **3.x** | Runtime validation | **Critical.** Valve/OpenDota responses change silently with patches. Parse every external response. |
| pino | **9.x** | Structured logging | Fast JSON logging. `pino-pretty` for local dev. |
| @hono/node-server | **1.x** | Node adapter | Serves Hono on Node.js. |

### Infrastructure

| Technology | Purpose | Why |
|---|---|---|
| Upstash Redis | Cache | HTTPS Redis, no connection pool, generous free tier. Pay-per-request beats Railway Redis for idle workloads. |
| Vercel (Hobby) | Frontend hosting | Zero-config Vite deploys, global CDN, free TLS. |
| Railway (Hobby $5/mo) | Backend hosting | Dockerless deploy from git. **Note:** Railway removed free tier in 2023 — $5/mo minimum. Alt: Render.com free (spins down after 15 min idle) or Fly.io. |

### Supporting Libraries

| Library | Version | Purpose |
|---|---|---|
| `date-fns` | 4.x | Match duration, series timestamps. Tree-shakeable. |
| `clsx` | 2.x | Conditional classNames. Essential alongside Tailwind. |
| `react-error-boundary` | 4.x | Wrap each panel so a failing Stratz call doesn't crash the page. |
| `vitest` | 2.x | Unit tests. Use for zod schemas and `buildingDecoder`. |
| `tsx` | 4.x | TS dev runner. Replaces `ts-node + nodemon`: `tsx watch src/index.ts`. |
| `eslint` + `@typescript-eslint` | 9.x / 8.x | Linting. ESLint 9 flat config. |
| `prettier` | 3.x | Formatting. Pair with eslint-config-prettier. |

---

## Deliberately Excluded

| Library | Why Not |
|---|---|
| **Express 5** | Hono is faster, smaller, better TS. Express's middleware ecosystem is irrelevant for a 6-route proxy. |
| **axios** | Native `fetch` in Node 24 and all modern browsers. |
| **node-cron** | Client-driven polling via TanStack Query is sufficient. |
| **Redux / Redux Toolkit** | Overkill. TanStack Query + Zustand cover all state needs. |
| **Next.js** | No SSR/SEO benefit for a private tool. SPA via Vite ships in half the config. |
| **tRPC** | You're fronting external APIs. Plain REST + zod is simpler. |
| **Prisma / Drizzle** | No database in v1. If added later for match history, Drizzle is the 2025 pick. |
| **WebSocket / Socket.IO** | Valve doesn't push. Polling is mandatory. |
| **Jest** | Vitest is the 2025 default with Vite. Faster, drop-in API. |

---

## Installation

### Backend
```bash
mkdir backend && cd backend
npm init -y
npm install hono @hono/node-server ioredis zod pino
npm install -D typescript @types/node tsx vitest eslint @typescript-eslint/eslint-plugin prettier
npx tsc --init --target es2022 --module nodenext --moduleResolution nodenext --strict
```

`package.json` scripts:
```json
{
  "scripts": {
    "dev": "tsx watch --env-file=.env src/index.ts",
    "build": "tsc",
    "start": "node --env-file=.env dist/index.js",
    "test": "vitest"
  }
}
```

### Frontend
```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install @tanstack/react-query @tanstack/react-query-devtools react-router zustand clsx date-fns react-error-boundary
npm install -D tailwindcss @tailwindcss/vite
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

`src/index.css`:
```css
@import "tailwindcss";

@theme {
  --color-radiant: #4ade80;
  --color-dire: #ef4444;
}
```

---

## Critical Stack Decisions

### 1. TypeScript everywhere
Valve's `GetLiveLeagueGames` has ~40 top-level fields per match, nested draft/player/team objects, and optional fields that appear only in specific `game_state` values. TS + zod validates once at the boundary instead of forcing every consumer into defensive `?.` chains.

### 2. Parse-don't-validate with zod
Every external API response MUST pass through a zod schema before entering business logic:
```ts
const LiveMatchSchema = z.object({
  match_id: z.number(),
  game_state: z.number().int().min(1).max(6),
  building_state: z.number().int().optional(),
})
type LiveMatch = z.infer<typeof LiveMatchSchema>
```

### 3. Dynamic polling interval via TanStack Query
```ts
refetchInterval: (query) => {
  const gameState = query.state.data?.match?.game_state
  if (gameState === 2) return 5_000   // draft
  if (gameState === 5) return 30_000  // in-game
  return false                         // pre-/post-game: stop
}
```

### 4. Rate-limit enforcement at the cache layer
`cache.get()` wrapper is the ONLY path to upstream APIs. Never let a route call upstream services directly.

### 5. Stratz: optional and degradable
Win probability is nice-to-have. Wrap Stratz calls in `Promise.allSettled` so match page renders without it.

---

## Open Questions

- Exact Upstash free-tier command count as of 2026 (verify on signup).
- Stratz GraphQL schema for live breakdown — the existing guide shows REST `match/:id/breakdown`; Stratz has been pushing GraphQL since 2023. Verify before building Phase 6.
- Whether Valve's `stream_delay_s = 120` is still the current default.
- TanStack Query v5 dynamic `refetchInterval` signature — changed from v4. Confirm before writing the hook.
