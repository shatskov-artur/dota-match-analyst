# Phase 11: Harden & Deploy - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14
**Phase:** 11-harden-deploy
**Areas discussed:** Rate-limit queue + 429 backoff, Error boundaries, Deploy config, Polling-stop verification

---

## Rate-limit queue + 429 backoff

| Option | Description | Selected |
|--------|-------------|----------|
| p-queue + p-retry | Small proven libs (sindresorhus); queue per upstream + exponential backoff | ✓ |
| Bottleneck | Single lib, reservoir/minTime/retry; heavier API | |
| Hand-rolled | ~50 lines, zero deps, self-tested | |

**429 exhaustion behavior:**

| Option | Description | Selected |
|--------|-------------|----------|
| Stale cache if present, else 503 | Serve last Redis value (stale) when available; otherwise 503 with clear message | ✓ |
| Immediate 503/429 | Return error right away, client shows boundary/retry | |

**Notes:** Queue lives inside `cached()` (the only upstream path). Respect `Retry-After` when present. Structured pino throttle logs.

---

## Error boundaries

| Option | Description | Selected |
|--------|-------------|----------|
| Per bento-card | Boundary around each Match panel/card; one widget crash isolates | ✓ |
| Per section | One boundary per big block (Row 1, Row 2, draft) | |
| Per route + key widgets | Whole-page boundary + targeted on risky widgets | |

**Fallback style:**

| Option | Description | Selected |
|--------|-------------|----------|
| Mini "couldn't load" card + retry | Neon Bento card surface, icon + message + Retry button | ✓ |
| Silent hide | Hide the broken widget, no message | |

**Notes:** Plus a route-level backstop boundary. Fallback reuses `.bento-card` styling.

---

## Deploy config

**Railway build:**

| Option | Description | Selected |
|--------|-------------|----------|
| Nixpacks (auto) | Railway auto-detects Node; minimal config | ✓ |
| Dockerfile | Explicit multi-stage; more control, more maintenance | |

**Split-origin (Vercel ↔ Railway):**

| Option | Description | Selected |
|--------|-------------|----------|
| VITE_API_URL + CORS | Client reads BFF base URL from env; BFF allows Vercel origin | ✓ |
| Vercel rewrites → BFF | Vercel proxies /api/* to Railway; one origin, +latency | |

**Deploy docs:**

| Option | Description | Selected |
|--------|-------------|----------|
| .env.production.example + DEPLOY.md | Env template + step-by-step Railway/Vercel/Upstash guide | ✓ |
| Configs only | Just config files, no guide | |

---

## Polling-stop verification

| Option | Description | Selected |
|--------|-------------|----------|
| Verify + test | Confirm stop works across all pollers; add game_state===6 test | ✓ |
| Already done, skip | Treat as complete (useMatchDetail has it) | |

---

## Execution order

| Option | Description | Selected |
|--------|-------------|----------|
| Hardening → then deploy | Build boundaries + rate-limit + polling-stop, then deploy configs | ✓ |
| All in one phase (planner decides) | Let planner sequence the waves | |

## Claude's Discretion

- Exact p-queue concurrency/interval per upstream
- pino throttle-event log shape
- Single reusable error-boundary component vs a small set
- railway.json / vercel.json field layout

## Deferred Ideas

None — discussion stayed within phase scope.
