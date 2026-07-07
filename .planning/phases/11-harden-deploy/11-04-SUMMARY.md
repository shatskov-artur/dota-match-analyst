---
phase: 11-harden-deploy
plan: 04
subsystem: infra
tags: [deploy, railway, vercel, upstash, nixpacks, cors, vite, split-origin, spa-rewrite]

# Dependency graph
requires:
  - phase: 11-harden-deploy (11-01)
    provides: "Per-upstream rate-limit queues, 429 backoff, stale-cache fallback, status-only throttle logging — the hardening this deploy exposes publicly"
  - phase: 11-harden-deploy (11-02)
    provides: "Per-bento error boundaries so a single card fault does not blank the public SPA"
  - phase: 11-harden-deploy (11-03)
    provides: "Polling-stop verification (game_state===6) so finished matches don't drain quota on the live host"
  - phase: 01-foundations
    provides: "env.ts EnvSchema (safeParse(process.env)), /api/health route, cached() Redis chokepoint"
provides:
  - "Split-origin production wiring: SPA (Vercel) → BFF (Railway) via build-time VITE_API_URL base"
  - "Env-driven CORS scoped to /api/* (exact origin, credentials false, no '*')"
  - "Railway prod start (node dist/index.js, no --env-file) reading dashboard-injected process.env"
  - "railway.json (NIXPACKS + /api/health healthcheck) + client/vercel.json (SPA rewrite)"
  - ".env.production.example + .env.example (STRATZ_TOKEN fix) + DEPLOY.md (Railway+Vercel+Upstash guide)"
affects: [deploy, ROADMAP criterion 4, phase-11 verifier]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Build-time API base: API_BASE = import.meta.env.VITE_API_URL ?? '' — '' preserves the dev Vite proxy, a set value bakes in the Railway origin"
    - "Env-driven CORS: cors({ origin: env.CORS_ORIGIN ?? 'http://localhost:5173' }) scoped to /api/*, credentials false (T-11-08)"
    - "Config-as-code deploy: railway.json (NIXPACKS explicit) + client/vercel.json (SPA rewrite) committed at repo/client root"
    - "Dashboard-only secrets: only *.example templates committed; real secrets live in Railway/Vercel dashboards (T-11-10)"

key-files:
  created:
    - client/src/lib/apiBase.ts
    - railway.json
    - client/vercel.json
    - .env.production.example
    - DEPLOY.md
  modified:
    - client/src/hooks/useLiveGames.ts
    - client/src/hooks/useMatchDetail.ts
    - client/src/hooks/useDraftDetail.ts
    - client/src/hooks/useWinProbability.ts
    - client/src/hooks/useMatchIntel.ts
    - client/src/hooks/useHeroStats.ts
    - server/src/env.ts
    - server/src/index.ts
    - server/package.json
    - .env.example

key-decisions:
  - "API_BASE fallback is '' (not a hardcoded localhost) so the untouched Vite dev proxy keeps serving /api/* in dev while prod inlines the Railway origin"
  - "CORS_ORIGIN is z.string().optional() — optional so local boot works without it; prod supplies the exact Vercel URL via the Railway dashboard"
  - "Canonical `start` dropped --env-file (Railway injects env via process.env); dev convenience preserved as `start:local`"
  - "railway.json pins builder: NIXPACKS explicitly because Railpack is the 2026 Railway default"
  - "vercel.json rewrite serves only static /index.html; cleanUrls NOT enabled (T-11-09 open-redirect avoidance)"

patterns-established:
  - "Split-origin base URL: all client fetch call-sites use `${API_BASE}/api/...`; API_BASE central in client/src/lib/apiBase.ts"
  - "Secrets stay in dashboards: repo carries only *.example templates (T-11-10)"

requirements-completed: []  # hardening/deploy plan — no direct REQ mapping; acceptance bar = ROADMAP criterion 4

# Metrics
duration: ~20min (this session; Tasks 1-2 landed in a prior session)
completed: 2026-07-07
---

# Phase 11 Plan 04: Split-Origin Deploy Configuration Summary

**The app is fully wired for a shareable split-origin deploy — SPA on Vercel calling the BFF on Railway (Upstash Redis) with a build-time `VITE_API_URL` base and env-driven CORS — and every code/config artifact is committed. The live deploy itself is an outstanding human-action checkpoint (needs real Railway/Vercel/Upstash accounts + secrets).**

## Performance

- **Duration:** ~20 min this session (Task 3 + verification + docs); Tasks 1 & 2 were committed in a prior session on master.
- **Completed:** 2026-07-07
- **Tasks:** 3 of 4 autonomous tasks complete; Task 4 is a blocking human-action deploy checkpoint (not performed).
- **Files modified:** 15 (5 created, 10 modified)

## Accomplishments

- **Task 1 — build-time API base (prior session, `e969f91`):** Created `client/src/lib/apiBase.ts` exporting `API_BASE = import.meta.env.VITE_API_URL ?? ''` and routed all six client fetch hooks (`useLiveGames`, `useMatchDetail`, `useDraftDetail`, `useWinProbability`, `useMatchIntel`, `useHeroStats`) through `${API_BASE}/api/...`. No bare `fetch('/api` remains under `client/src/hooks`. Dev keeps working unchanged (empty base → Vite proxy).
- **Task 2 — env-driven CORS + Railway start (prior session, `9a85714`):** Added optional `CORS_ORIGIN: z.string().optional()` to `server/src/env.ts`; changed `server/src/index.ts` CORS from hardcoded-localhost-on-`*` to `app.use('/api/*', cors({ origin: env.CORS_ORIGIN ?? 'http://localhost:5173' }))` (exact origin, credentials false — T-11-08). Reconciled the prod start: canonical `start` is now `node dist/index.js` (no `--env-file`, reads Railway-injected `process.env`); `start:local` preserves the dev `--env-file` path. PORT stays Railway-injected.
- **Task 3 — deploy config + docs (this session, `726b13a`):** `railway.json` (explicit `NIXPACKS`, healthcheck `/api/health`, ON_FAILURE restart), `client/vercel.json` (SPA rewrite `/(.*) → /index.html`), `.env.production.example` (split-origin BFF + Vercel build-time env, PORT "do NOT set", no-trailing-slash notes), `.env.example` fixed to include `STRATZ_TOKEN` (env.ts requires it) + commented dev `CORS_ORIGIN`, and a 126-line `DEPLOY.md` documenting the full Upstash → Railway → Vercel → cross-wire CORS → smoke-test flow plus a preview-deploy CORS note.

## Task Commits

Each autonomous task was committed atomically:

1. **Task 1: apiBase.ts + 6 hook refactor** — `e969f91` (feat) *(prior session)*
2. **Task 2: env-driven CORS + Railway prod start** — `9a85714` (feat) *(prior session)*
3. **Task 3: railway.json + vercel.json + env templates + DEPLOY.md** — `726b13a` (feat) *(this session)*

## Verification

- `cd server && npm run build` → exit 0 (tsc clean).
- `cd client && npm run build` → exit 0 (tsc + vite build; 440 modules, dist emitted).
- `cd server && npm test -- --run` → **110/110 passing** (pre-existing stratz/roshan mock stderr noise only, per 11-01 SUMMARY — out of scope).
- `cd client && npm test -- --run` → **123/123 passing**.
- `node -e "JSON.parse(railway.json); JSON.parse(client/vercel.json)"` → `json ok`.
- Acceptance greps confirmed: `NIXPACKS` + `/api/health` in railway.json; `/index.html` in client/vercel.json; `STRATZ_TOKEN` in .env.example; `VITE_API_URL` + `CORS_ORIGIN` in .env.production.example; DEPLOY.md is 126 lines and mentions Railway/Vercel/Upstash/VITE_API_URL/CORS_ORIGIN.

## Deviations from Plan

None — plan executed exactly as written. On entry, Tasks 1 & 2 were already complete/committed from a prior session, and the Task 3 config files (railway.json, client/vercel.json, .env.production.example, .env.example edit) were already authored but **uncommitted**; `DEPLOY.md` was **missing**. This session authored `DEPLOY.md`, re-verified all builds/tests green, and committed the complete Task 3 set atomically. No code behavior changed relative to the plan's intent.

## Outstanding Human-Action Checkpoint (Task 4 — blocking)

**The live deploy was intentionally NOT performed** — it requires real Upstash/Railway/Vercel accounts, secrets, and dashboard configuration that only the human owner can supply. All autonomous code/config is in place; the remaining work is manual, documented in full in `DEPLOY.md`. Required order:

1. **Upstash:** create a Redis DB; copy the ioredis connect URL + token.
2. **Railway:** connect the repo, set **Root Directory = `server/`**, add env vars
   (`NODE_ENV=production`, `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN`, `VALVE_API_KEY`,
   `STRATZ_TOKEN`; **do NOT set PORT** — Railway injects it), deploy, and confirm the
   `/api/health` healthcheck is green. Copy the Railway public URL.
3. **Vercel:** import the repo, set **Root Directory = `client/`**, set **`VITE_API_URL`** to the
   Railway URL (no trailing slash, no `/api`) **BEFORE building** (Vite inlines `VITE_*` at build
   time), deploy. Copy the Vercel production URL.
4. **Cross-wire CORS:** set Railway **`CORS_ORIGIN`** to the exact Vercel production URL
   (no trailing slash), redeploy the BFF.
5. **Smoke test:** open the Vercel URL (live list loads), hard-refresh `/match/:id` (no 404 →
   SPA rewrite works), confirm no CORS error in the console.

**Post-deploy verification commands the owner can run:**

```bash
# BFF health (replace with your Railway URL)
curl -s https://your-bff.up.railway.app/api/health

# BFF live games via the public API (should return JSON, not a CORS/500 error)
curl -s https://your-bff.up.railway.app/api/live/games | head -c 400

# CORS preflight allow-origin check (should echo the exact Vercel origin, not '*')
curl -s -I -X OPTIONS https://your-bff.up.railway.app/api/live/games \
  -H "Origin: https://your-app.vercel.app" \
  -H "Access-Control-Request-Method: GET" | grep -i access-control-allow-origin
```

Then in a browser: open `https://your-app.vercel.app`, confirm the live matches list renders,
navigate to a match and hard-refresh (no 404), and check DevTools console for zero CORS errors.

## Issues Encountered

- Pre-existing server-suite stderr noise (`redis.rpush/lrange is not a function`, `[cache] GET error`) from `stratzApi.test.ts` / `live.roshan.test.ts` — carried over from Wave 1 mock gaps, all 110 tests still pass. Out of scope (scope boundary); not touched.

## Next Phase Readiness

- ROADMAP criterion 4 (shareable split-origin deploy) is **config-complete**; the only remaining step is the human deploy-smoke (Task 4), which is manual-by-nature per 11-VALIDATION.md.
- D-08 (Railway Nixpacks), D-09 (split-origin VITE_API_URL + env CORS), D-10 (.env.production.example + DEPLOY.md) all implemented and committed.
- D-12 honored: this deploy plan ran only after the three hardening plans (depends_on 11-01/02/03, all complete on master).

## Threat Flags

None — no new security surface beyond the plan's `<threat_model>`. CORS is exact-origin/credentials-false/scoped `/api/*` (T-11-08 mitigated), the SPA rewrite serves only static `/index.html` with no server redirect logic (T-11-09 mitigated), and only `*.example` templates are committed with placeholder values (T-11-10 mitigated). Only `VITE_API_URL` (a public URL) reaches the client bundle (T-11-11 accepted, intentional).

## Self-Check: PASSED

- Created files verified present: `client/src/lib/apiBase.ts`, `railway.json`, `client/vercel.json`, `.env.production.example`, `DEPLOY.md`.
- Commits verified in git log: `e969f91`, `9a85714`, `726b13a`.
- `cd server && npm run build` exit 0; `cd client && npm run build` exit 0; server 110/110, client 123/123 tests green; both JSON configs parse.

---
*Phase: 11-harden-deploy*
*Completed: 2026-07-07 (autonomous tasks; live deploy outstanding as human-action checkpoint)*
