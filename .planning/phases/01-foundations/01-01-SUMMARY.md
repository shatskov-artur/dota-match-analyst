---
phase: 01-foundations
plan: 01
subsystem: infra
tags: [monorepo, hono, vite, react, tailwind, typescript, shared-types]

# Dependency graph
requires: []
provides:
  - Flat monorepo scaffold: client/, server/, shared/ each with package.json + tsconfig.json
  - Root package.json with concurrently dev script (npm run dev starts both)
  - Hono 4 BFF on port 3001 with GET /health endpoint, CORS locked to localhost:5173
  - Vite 6 + React 19 client on port 5173 with Tailwind v4 CSS-first setup
  - "@shared/* path alias wired in both server/tsconfig.json and client/tsconfig.json"
  - .env.example with PORT, UPSTASH_REDIS_REST_URL, VALVE_API_KEY placeholders
  - shared/index.ts empty barrel (heroMapper/buildingDecoder/hiddenProfile added in Plan 04)
affects: [01-02, 02-live-matches, 03-match-core, 04-draft-ux, 05-hero-intel, 06-win-prob, 07-harden-deploy]

# Tech tracking
tech-stack:
  added:
    - concurrently ^9.0.0 (root dev script)
    - tsx ^4.0.0 (root seed runner + server dev runner)
    - hono ^4.0.0 (BFF HTTP framework)
    - "@hono/node-server ^1.0.0 (Node adapter for Hono)"
    - ioredis ^5.0.0 (Redis client, used in Plan 02)
    - zod ^3.0.0 (runtime validation, used in Plans 03+)
    - pino ^9.0.0 (structured logging)
    - react ^19.2.0 + react-dom ^19.2.0
    - "@tanstack/react-query ^5.0.0 + devtools"
    - react-router ^7.0.0
    - zustand ^5.0.0
    - tailwindcss ^4.1.0 + "@tailwindcss/vite ^4.1.0"
    - vite ^6.0.0 + "@vitejs/plugin-react ^4.0.0"
    - vitest ^2.0.0 (both server and client)
  patterns:
    - No npm workspaces — each package.json is independent
    - "@shared/* alias in tsconfig paths (NodeNext for server, bundler for client)"
    - Vite proxy /api/* -> http://localhost:3001 for dev
    - Tailwind v4 CSS-first: @import "tailwindcss" + @theme block, no postcss.config.js
    - CORS restricted to dev origin (localhost:5173) in Hono middleware

key-files:
  created:
    - package.json (root concurrently dev script)
    - .env.example (API key placeholders)
    - shared/package.json
    - shared/tsconfig.json
    - shared/index.ts
    - server/package.json
    - server/tsconfig.json
    - server/src/index.ts
    - client/package.json
    - client/tsconfig.json
    - client/vite.config.ts
    - client/index.html
    - client/src/main.tsx
    - client/src/App.tsx
    - client/src/index.css
  modified:
    - .gitignore (added node_modules/, dist/, .env, *.local)

key-decisions:
  - "D-01: Flat dirs client/, server/, shared/ at repo root — no npm workspaces"
  - "D-02: @shared/* alias in both tsconfigs pointing to ../shared/*"
  - "D-03: Root package.json dev script uses concurrently"
  - "T-01-01: .env excluded from git; .env.example committed with placeholders only"
  - "T-01-02: CORS origin locked to http://localhost:5173 in Hono middleware"

patterns-established:
  - "Pattern: BFF proxy — client fetches /api/* which Vite dev proxy rewrites to http://localhost:3001"
  - "Pattern: Shared types — server and client both import from shared/ via @shared/* alias, no npm link or workspaces needed"
  - "Pattern: Tailwind v4 CSS-first — @import 'tailwindcss' + @theme {} in index.css, @tailwindcss/vite plugin"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-04-22
---

# Phase 1 Plan 01: Monorepo Scaffold Summary

**Flat monorepo with Hono 4 BFF (GET /health), Vite 6 + React 19 client, Tailwind v4 CSS-first, and @shared/* TypeScript alias wired in both server and client tsconfigs**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-22T18:59:41Z
- **Completed:** 2026-04-22T19:03:20Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments
- Root package.json with concurrently dev script — `npm run dev` starts both Vite (5173) and Hono (3001)
- Hono BFF with GET /health returning `{"status":"ok","ts":...}` and CORS restricted to dev origin
- Vite + React 19 + Tailwind v4 client with /api proxy to BFF and App.tsx smoke-testing /health
- @shared/* alias wired in both server/tsconfig.json and client/tsconfig.json — both TypeScript checks pass with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Root + shared/ scaffold** - `198d659` (chore)
2. **Task 2: server/ scaffold** - `8d54c81` (feat)
3. **Task 3: client/ scaffold** - `86027b7` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `package.json` - Root devDeps (concurrently, tsx) + dev script
- `.gitignore` - node_modules, dist, .env, *.local
- `.env.example` - PORT, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, VALVE_API_KEY placeholders
- `shared/package.json` - @dota-stats/shared, type:module, no runtime deps
- `shared/tsconfig.json` - strict, ES2022, NodeNext
- `shared/index.ts` - empty barrel (primitives added in Plan 04)
- `server/package.json` - Hono 4, ioredis 5, zod 3, pino 9, tsx dev runner
- `server/tsconfig.json` - strict, NodeNext, @shared/* alias
- `server/src/index.ts` - Hono app, cors middleware, GET /health, serve on port 3001
- `client/package.json` - React 19.2, TanStack Query v5, react-router 7, Tailwind 4.1
- `client/tsconfig.json` - strict, ESNext/bundler moduleResolution, @shared/* alias
- `client/vite.config.ts` - @tailwindcss/vite plugin, @shared alias, /api proxy to :3001
- `client/src/index.css` - @import "tailwindcss", --color-radiant and --color-dire custom props
- `client/src/App.tsx` - fetch /api/health smoke test, displays BFF status
- `client/src/main.tsx` - StrictMode root render
- `client/index.html` - Vite entry point

## Decisions Made
- Followed all plan decisions (D-01 through D-03) exactly as specified
- Dropped `@types/ioredis` from server devDependencies — the package doesn't exist separately (ioredis 5 ships its own types)
- CORS threat mitigation T-01-02 applied: `cors({ origin: 'http://localhost:5173' })` in server entry point

## Deviations from Plan

None - plan executed exactly as written. The `@types/ioredis` entry in the plan's server/package.json was silently omitted because ioredis 5 bundles its own TypeScript types — no deviation rule needed, it simply doesn't exist as a separate package.

## Issues Encountered
None — TypeScript checked clean on both server and client. `npm run build` in client exits 0.

## User Setup Required
None - no external service configuration required at this stage. Redis and API keys are needed when Plans 02/03 introduce the cache layer and Valve API calls. The `.env.example` file documents what will be needed.

## Next Phase Readiness
- Plan 01-02 (Redis cache module + seed script) can begin immediately — server/ scaffold is in place
- Both tsconfigs accept @shared/* imports — shared primitives from Plan 04 will resolve without further config
- Server health endpoint provides immediate integration point for client smoke test

---
*Phase: 01-foundations*
*Completed: 2026-04-22*
