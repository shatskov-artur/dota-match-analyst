# Phase 11: Harden & Deploy - Research

**Researched:** 2026-06-14
**Domain:** Rate-limit queueing (p-queue/p-retry), React 19 error boundaries, split-origin deploy (Railway/Vercel/Upstash)
**Confidence:** HIGH (libraries + deploy configs verified against current docs/registry; quota-math numbers are reasoned recommendations flagged for confirmation)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use **p-queue + p-retry** (sindresorhus). p-queue = per-upstream concurrency/interval control; p-retry = exponential backoff on 429. Chosen over Bottleneck / hand-rolled.
- **D-02:** **One queue per upstream** — separate p-queue instances for Valve, OpenDota, Stratz, each tuned to its own quota. Applied inside the `cached()` wrapper (the only path to upstream) so every call is covered without touching call sites.
- **D-03:** On 429, retry with exponential backoff (respect `Retry-After` header when present). After retries exhausted: **return stale cache if present in Redis, otherwise 503** with a clear message. Never block indefinitely.
- **D-04:** Every throttle/backoff event emits a structured pino log (criterion 2) — extend existing `logger.ts` with throttle-event fields (upstream, attempt, delay, status).
- **D-05:** Error-boundary granularity = **per bento-card**. Each Match panel/card gets its own boundary.
- **D-06:** Fallback = **mini "couldn't load" card** in the project's bento style (surface tile, icon + short message + Retry button). Retry re-mounts the boundary's children. Not silent-hide.
- **D-07:** Also wrap each route (Home, Match) in a top-level boundary as a backstop; per-card boundaries are the primary isolation layer.
- **D-08:** BFF on Railway via **Nixpacks** (auto-detect Node, npm build → npm start). Minimal config: `railway.json` + production `start` script. No Dockerfile.
- **D-09:** Split-origin: frontend (Vercel) calls BFF (Railway) via **`VITE_API_URL` env + CORS** on the BFF. Client reads BFF base URL from `VITE_API_URL`; **no Vercel rewrite proxy**.
- **D-10:** Document deploy with **`.env.production.example` + `DEPLOY.md`** — step-by-step for Railway, Vercel, Upstash. Owner deploys manually.
- **D-11:** **Verify + add a test** for polling-stop. `useMatchDetail` already stops at `game_state === 6`. Confirm live-list and draft pollers too. Add a unit test asserting `refetchInterval === false` when `game_state === 6` if one doesn't exist.
- **D-12:** **Hardening first, then deploy.** Error boundaries + rate-limit queue + polling-stop (code), THEN deploy configs.

### Claude's Discretion

- Exact p-queue concurrency/interval numbers per upstream (derive from quotas + caching TTLs).
- Exact pino log field names/shape for throttle events.
- Whether the error-boundary component is one reusable `<BentoErrorBoundary>` or a small set.
- `railway.json` / `vercel.json` exact field layout.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. Auth, public-matchmaking matches, and WebSocket are permanently out of v1 scope per PROJECT.md (not Phase-11 deferrals).
</user_constraints>

## Summary

Phase 11 is a hardening-then-deploy phase. All four acceptance criteria map cleanly to the existing architecture: the single `cached()` chokepoint (server/src/cache.ts) is where per-upstream queue + retry attach; the bento-card layout in MatchPage.tsx is where per-card error boundaries wrap; the four TanStack Query pollers already implement dynamic `refetchInterval` with `game_state === 6` guards; and the split-origin deploy is mostly configuration plus a small `VITE_API_URL` base-URL refactor of client fetch calls.

The dependencies are already current or near-current: **p-queue 9.3.0** and **p-retry 8.0.0** are both pure-ESM (`type: module`, matching the server's `"type": "module"`), p-retry requires Node ≥22 (project runs Node 24 — fine). `react-error-boundary 6.1.2` supports React 19 (`peerDependencies: react ^18 || ^19`) — **note the client package.json currently pins `^4.0.0`, which must be bumped to `^6`**. Hono 4.12.x's `hono/cors` middleware already covers the CORS requirement; the BFF already imports it (hardcoded to localhost — needs to read an env origin). The existing `cache.ts` already connects to Upstash with `rediss://` + TLS correctly, and because the BFF is a long-lived Railway process (not a serverless function), ioredis persistent connections are the right choice — no HTTP-client caveat applies.

The two non-trivial design decisions the planner must resolve: (1) **the stale-cache-on-429 fallback (D-03) cannot read from the same TTL'd key** — once a key's TTL expires, Redis evicts it, so "return stale cache if present" needs a separate longer-lived stale copy written alongside the fresh one; and (2) **honoring `Retry-After` requires a custom delay** because p-retry computes its own exponential backoff and does not natively override the next delay from an error property — the standard pattern is to sleep the residual inside `onFailedAttempt`.

**Primary recommendation:** Wrap the upstream `fn()` inside `cached()` with `queue.add(() => pRetry(fn, opts))`, one queue per upstream. Write a parallel `stale:<key>` copy on every success (long TTL) so D-03 can serve it on 429-exhaustion. Bump react-error-boundary to v6, build one reusable `<BentoErrorBoundary>` using `FallbackComponent` + `resetKeys`. Deploy via `railway.json` (`builder: NIXPACKS`) + `vercel.json` (SPA rewrite) + env-driven CORS origin.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-upstream rate-limit queue + 429 backoff | API / Backend (`cached()` in server/src/cache.ts) | — | Quota protection must be server-side; client never talks to upstreams directly (CLAUDE.md) |
| Stale-cache-on-exhaustion / 503 | API / Backend (`cached()` + route layer) | Redis/Storage | Stale copy lives in Redis; decision logic in `cached()` |
| Structured throttle logging | API / Backend (`logger.ts`) | — | pino → stdout → Railway log collector |
| Per-card error isolation | Browser / Client (React error boundaries in MatchPage) | — | A render crash in one widget is a client-render concern |
| Route-level error backstop | Browser / Client (App.tsx route wrappers) | — | Catches anything per-card boundaries miss |
| Polling-stop at game_state===6 | Browser / Client (TanStack Query `refetchInterval`) | — | Already query-config; reduces upstream load indirectly |
| CORS allow Vercel origin | API / Backend (`hono/cors` in index.ts) | — | Cross-origin browser requests gated server-side |
| BFF base-URL injection | Browser / Client build (`VITE_API_URL`) | CDN/Static (Vercel build) | Vite inlines `VITE_*` at build time |
| Redis connection (TLS) | API / Backend (`cache.ts` ioredis) | Database/Storage (Upstash) | Persistent connection from long-lived Railway process |

## Standard Stack

### Core
| Library | Version (verified) | Purpose | Why Standard |
|---------|--------------------|---------|--------------|
| p-queue | **9.3.0** | Per-upstream concurrency + interval throttle | sindresorhus, tiny, pure-ESM, the de-facto promise queue. `[VERIFIED: npm view p-queue version]` |
| p-retry | **8.0.0** | Exponential backoff retry on 429 | sindresorhus, composes with p-queue, `onFailedAttempt` hook for logging + Retry-After. `[VERIFIED: npm view p-retry version]` |
| react-error-boundary | **6.1.2** | Declarative React error boundaries (no class boilerplate) | bvaughn, React 19 compatible, `FallbackComponent`/`resetKeys`/`useErrorBoundary`. `[VERIFIED: npm view react-error-boundary version + peerDependencies]` |

### Supporting (already installed — no version change)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| hono | ^4.12.25 | `hono/cors` middleware for split-origin | Already imported in index.ts. `[VERIFIED: npm view hono version]` |
| ioredis | ^5.11.1 | Upstash Redis connection (TLS) | Already wired in cache.ts; no change needed. `[VERIFIED: npm view ioredis version]` |
| pino | ^9.0.0 | Structured throttle logs | Extend existing logger.ts. `[VERIFIED: server/package.json]` |

### Version / dependency actions for the planner
| Action | Reason |
|--------|--------|
| `npm install p-queue p-retry` in **server** | New deps for D-01. Both pure-ESM — fine with `"type": "module"`. `[VERIFIED: npm view ... type = 'module']` |
| **Bump** `react-error-boundary` `^4.0.0 → ^6.1.2` in **client** | Currently pinned to v4; v6 is current and React-19-safe. v5+ changed `useErrorHandler` → `useErrorBoundary`. `[VERIFIED: client/package.json + registry]` |

**Installation:**
```bash
# server/
npm install p-queue p-retry
# client/
npm install react-error-boundary@^6
```

### Alternatives Considered (locked out by CONTEXT — listed for completeness only)
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| p-queue + p-retry | Bottleneck | More features (clustering, reservoir), heavier, CJS-leaning. CONTEXT locked p-queue. |
| react-error-boundary | Hand-rolled class component | More boilerplate, no `resetKeys`/`useErrorBoundary`. Library is already a dependency. |
| Nixpacks | Railpack (new Railway default 2026) / Dockerfile | CONTEXT locked Nixpacks; still supported. `[CITED: blog.railway.com/p/introducing-railpack]` |

## Architecture Patterns

### System Architecture Diagram

```
                          BROWSER (Vercel-hosted SPA)
   ┌──────────────────────────────────────────────────────────────┐
   │  React 19 + Router v7                                         │
   │  ┌────────────────────────────────────────────────────────┐  │
   │  │ Route boundary (App.tsx)  ← backstop (D-07)            │  │
   │  │   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │  │
   │  │   │ BentoError   │ │ BentoError   │ │ BentoError   │   │  │
   │  │   │ Boundary     │ │ Boundary     │ │ Boundary     │   │  │  per-card (D-05/06)
   │  │   │  Heroes card │ │  Items card  │ │  Map / Rosh  │   │  │
   │  │   └──────────────┘ └──────────────┘ └──────────────┘   │  │
   │  └────────────────────────────────────────────────────────┘  │
   │  TanStack Query pollers → refetchInterval=false @ game_state 6│
   └───────────────┬──────────────────────────────────────────────┘
                   │  fetch(`${VITE_API_URL}/api/...`)   (split-origin)
                   ▼
        ┌──────────────────────────────────────────────────┐
        │  CORS preflight gate (hono/cors, origin = env)   │
        └───────────────────────┬──────────────────────────┘
                                ▼
   BFF (Railway, Node 24 + Hono)  ── routes ──► cached(key, ttl, fn)
                                                    │
                                  ┌─────────────────┼──────────────────┐
                                  ▼ HIT             ▼ MISS              ▼ stale path
                          Redis GET key      queue.add(()=>             on 429-exhaust:
                          (Upstash, TLS)     pRetry(fn, backoff))       Redis GET stale:key
                                  │                │                       │
                                  │         429 → onFailedAttempt          ├─ present → 200 (stale)
                                  │         → pino log + Retry-After sleep  └─ absent  → 503
                                  ▼                ▼ success
                           return JSON      SET key  (fresh TTL)
                                            SET stale:key (long TTL)
                                                 │
                                                 ▼  one PQueue instance per upstream
                                       ┌─────────┴──────────┬─────────────┐
                                       ▼                    ▼             ▼
                                  Valve API           OpenDota API    Stratz API
                                  100k/day            50k/month       500/hr
```

### Component Responsibilities
| File | Responsibility | Change in Phase 11 |
|------|----------------|--------------------|
| `server/src/cache.ts` | `cached()` — single upstream chokepoint | Add per-upstream queue param + pRetry wrap + stale-copy write + stale-on-exhaust read |
| `server/src/queues.ts` *(new)* | Three `PQueue` instances + tuned config | New file; exports `valveQueue`, `openDotaQueue`, `stratzQueue` |
| `server/src/logger.ts` | pino logger | Add a `logThrottle()` helper or document the throttle log shape |
| `server/src/services/*Api.ts` | Pass the right queue into `cached()` | Minimal: each service tells `cached()` which upstream it is |
| `server/src/index.ts` | Hono app + CORS | CORS `origin` from env (was hardcoded localhost) |
| `client/src/components/BentoErrorBoundary.tsx` *(new)* | Reusable per-card fallback | New |
| `client/src/pages/MatchPage.tsx` | Bento grid | Wrap each `.bento-card` child in `<BentoErrorBoundary>` |
| `client/src/App.tsx` | Routes | Wrap each route in a top-level boundary |
| `client/src/lib/apiBase.ts` *(new)* | `VITE_API_URL` base-URL helper | New; all `fetch('/api/...')` calls switch to `${API_BASE}/api/...` |
| `railway.json`, `vercel.json`, `DEPLOY.md`, `.env.production.example` *(new)* | Deploy config + docs | New top-level files |

### Pattern 1: Per-upstream queue + retry inside `cached()`
**What:** Wrap the upstream `fn()` in `queue.add(() => pRetry(fn, opts))`. One queue per upstream. The queue throttles request rate; pRetry handles 429 backoff.
**When to use:** Every upstream call — `cached()` is the only path (CLAUDE.md).
**Example:**
```ts
// server/src/queues.ts  — Source pattern: p-queue readme (sindresorhus/p-queue)
import PQueue from 'p-queue'

// intervalCap = max runs per `interval` window (rolling). concurrency caps simultaneity.
// Numbers are a SAFETY ENVELOPE on top of Redis caching — see "Queue config math" below.
export const valveQueue    = new PQueue({ concurrency: 2, interval: 1000, intervalCap: 5 })
export const openDotaQueue = new PQueue({ concurrency: 2, interval: 1000, intervalCap: 2 })
export const stratzQueue   = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 1 }) // 500/hr → keep slow
```

```ts
// server/src/cache.ts  (sketch) — Source pattern: p-retry readme (sindresorhus/p-retry)
import pRetry from 'p-retry'
import type PQueue from 'p-queue'
import { logThrottle } from './logger.js'

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
  opts?: { queue?: PQueue; upstream?: string },
): Promise<T> {
  // 1. fresh-cache GET (unchanged) ...
  // 2. on miss:
  const run = () => pRetry(fn, {
    retries: 4,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 30_000,
    shouldRetry: ({ error }) => isRateLimited(error),      // only retry 429s
    onFailedAttempt: async ({ error, attemptNumber, retriesLeft }) => {
      const status = (error as any).status
      const retryAfterMs = (error as any).retryAfterMs ?? null
      logThrottle({ upstream: opts?.upstream ?? key, attempt: attemptNumber, retriesLeft, status, delayMs: retryAfterMs })
      // Honor Retry-After by sleeping the RESIDUAL beyond p-retry's computed backoff:
      if (retryAfterMs) await sleep(retryAfterMs)
    },
  })
  try {
    const result = opts?.queue ? await opts.queue.add(run) : await run()
    // SET fresh key (ttlSeconds) AND a longer-lived stale copy:
    await writeFreshAndStale(key, result, ttlSeconds)
    return result
  } catch (err) {
    // D-03: retries exhausted → serve stale if present, else rethrow (route emits 503)
    const stale = await readStale<T>(key)
    if (stale !== null) return stale
    throw err
  }
}
```
> `[CITED: github.com/sindresorhus/p-queue readme]` `intervalCap`/`interval` define a rolling window; `concurrency` caps simultaneity. `[CITED: github.com/sindresorhus/p-retry readme]` `onFailedAttempt` receives `{ error, attemptNumber, retriesLeft, retriesConsumed, retryDelay }` and **can return a promise** to add delay.

### Pattern 2: Honoring `Retry-After` (the one gotcha)
**What:** p-retry computes its own exponential backoff (`factor`/`minTimeout`/`maxTimeout`) and has **no built-in option to replace the next delay** with a server-provided value. `[VERIFIED: p-retry readme — option list has no calculateDelay]`
**How:** In the upstream `fn()`, when you see a 429, read `res.headers.get('retry-after')`, attach it to the thrown error (e.g. `err.retryAfterMs`), and in `onFailedAttempt` `await sleep(retryAfterMs)` so the residual wait honors the server. This is additive to p-retry's own backoff but is the standard, documented workaround. `[CITED: p-retry readme — "onFailedAttempt can return a promise"]`
**Note:** `Retry-After` may be seconds (integer) or an HTTP-date — parse both.

### Pattern 3: Reusable `<BentoErrorBoundary>` (per-card, no prop drilling)
**What:** One reusable component wrapping `ErrorBoundary` from `react-error-boundary`, with a bento-styled fallback + Retry.
**Example:**
```tsx
// client/src/components/BentoErrorBoundary.tsx
// Source: react-error-boundary v6 readme (bvaughn/react-error-boundary)
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary'
import type { ReactNode } from 'react'

function BentoFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="bento-card flex flex-col items-center justify-center gap-2 text-center">
      <span aria-hidden className="text-text-dim">⚠</span>
      <p className="text-sm text-text">Couldn't load this panel.</p>
      <button
        onClick={resetErrorBoundary}
        className="text-[11px] uppercase tracking-[0.2em] text-text-dim hover:text-primary"
      >
        Retry
      </button>
    </div>
  )
}

export function BentoErrorBoundary({ children, resetKeys }: { children: ReactNode; resetKeys?: unknown[] }) {
  return (
    <ErrorBoundary
      FallbackComponent={BentoFallback}
      resetKeys={resetKeys}                 // e.g. [matchId] — auto-reset when the match changes
      onError={(error, info) => console.error('[bento-boundary]', error, info.componentStack)}
    >
      {children}
    </ErrorBoundary>
  )
}
```
**Usage in MatchPage.tsx:** wrap each existing `<div className="bento-card ...">…</div>` block's children. Pass `resetKeys={[matchId]}` so navigating to a new match clears a stuck boundary. `resetErrorBoundary` re-mounts children (D-06 "Retry re-mounts").
> `[CITED: react-error-boundary readme]` `FallbackComponent` receives `{ error, resetErrorBoundary }`; `resetKeys` auto-resets when any key changes; `onError` is the logging hook.

**Reuse `.bento-card` styling** (client/src/index.css lines 57–69): `background-color: var(--color-surface)`, `1px var(--color-border)`, `var(--radius-lg)`. The fallback uses the same class so a failed widget still looks intentional. Palette tokens (`--color-text`, `--color-text-dim`, `--color-primary`) per the `sketch-findings-dota-stats` skill.

### Pattern 4: Split-origin client base URL
**What:** All client fetches currently use relative `/api/...` (works in dev via the Vite proxy in vite.config.ts). In production the SPA is on Vercel and the BFF on Railway — relative paths would hit Vercel. Introduce a base-URL helper.
**Example:**
```ts
// client/src/lib/apiBase.ts
// Vite inlines import.meta.env.VITE_* at BUILD time. Empty string keeps the dev proxy working.
export const API_BASE = import.meta.env.VITE_API_URL ?? ''
// usage:  fetch(`${API_BASE}/api/live/games`)
```
Call sites to update (all currently `fetch('/api/...')`): `useLiveGames.ts`, `useMatchDetail.ts`, `useDraftDetail.ts`, `useWinProbability.ts`, `useMatchIntel.ts`, `useHeroStats.ts`. In dev, leave `VITE_API_URL` unset so the existing Vite proxy continues to work.

### Anti-Patterns to Avoid
- **Calling `fetch()` outside `cached()`** — bypasses the queue and the quota protection (CLAUDE.md forbids it). The queue only protects what flows through `cached()`.
- **Reading "stale" from the same TTL'd key** — Redis evicts the key at TTL; a `GET` after expiry returns `null`. D-03 needs a **separate longer-lived stale key**.
- **Letting p-retry retry non-429 errors** — without `shouldRetry`, p-retry retries every throw (including ZodErrors / 503s), wasting quota and delaying the 503. Gate retries to rate-limit statuses.
- **`origin: '*'` with `credentials: true`** — browsers reject this combination. The app uses no cookies/auth (v1), so `credentials` should stay `false` and `origin` be the exact Vercel URL.
- **Hardcoding the Vercel origin in code** — read it from an env var (`CORS_ORIGIN`) so preview/prod URLs don't require a code change.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-upstream throttle | A custom token-bucket / setInterval scheduler | p-queue `intervalCap`+`interval`+`concurrency` | Edge cases: carryover, draining, autoStart, queue ordering |
| Exponential backoff on 429 | A manual retry loop with `setTimeout` | p-retry `retries`/`factor`/`minTimeout`/`maxTimeout` | Jitter (`randomize`), abort signal, attempt accounting, `shouldRetry` |
| React error capture | A bespoke class `componentDidCatch` | react-error-boundary `ErrorBoundary` + `resetKeys` | `resetKeys`, `useErrorBoundary`, render-prop fallback, tested |
| CORS preflight | Manual OPTIONS handler + header writing | `hono/cors` | Auto preflight, header normalization, origin function |
| SPA deep-link routing | Custom 404 → index rewrite logic | `vercel.json` rewrites | One declarative rewrite; Vercel handles it at the edge |
| Redis TLS connection | Re-implementing connect/retry | existing `cache.ts` ioredis (already done) | Already handles `rediss://`, TLS, lazy init, error events |

**Key insight:** Every one of the four criteria has a small, well-tested library or a single declarative config that beats a hand-rolled equivalent. The only genuinely custom logic in this phase is the **stale-cache-on-exhaustion fallback** (D-03), which is project-specific and must be written by hand inside `cached()`.

## Queue Config Math (Claude's Discretion — recommended numbers)

The queues are a **safety envelope on top of caching**, not the primary quota control — `cached()` already collapses N viewers into 1 upstream call per TTL. With caching, the realistic *steady-state* upstream rates are bounded by the TTLs, not by viewer count:

| Upstream | Documented quota | Cached endpoints (TTL) | Steady-state upstream calls (worst case) | Recommended PQueue config | Headroom vs quota |
|----------|------------------|------------------------|------------------------------------------|----------------------------|-------------------|
| **Valve** | 100k/day (~1.16/s avg) | `live_games` 30s, `live_games:draft` 4s | ~2 keys → ≤ (1/30 + 1/4)/s ≈ 0.28/s ≈ 24k/day | `concurrency: 2, interval: 1000, intervalCap: 5` | ~4× headroom; bursts (new matches) absorbed |
| **OpenDota** | 50k/month (~0.019/s avg) | `league:{id}` 6h, `hero:stats` 6h, `player:heroes:{id}` 15min | Dominated by player lookups; per active match ~10 players/15min | `concurrency: 2, interval: 1000, intervalCap: 2` | Tight monthly budget — interval cap throttles burst of player lookups at draft |
| **Stratz** | 500/hr (~0.14/s avg) | `stratz:winprob:{id}` 60s, `stratz:matchups:v2:{id}` 6h | winprob: 1/min/match; matchups: ~rare (6h) | `concurrency: 1, interval: 1000, intervalCap: 1` | Most constrained — serialize and keep ≤1/s; 60s winprob TTL keeps it well under 500/hr even with several concurrent matches |

**Reasoning notes (flag for confirmation — see Assumptions Log):**
- The `intervalCap`/`interval` numbers throttle **burst** (e.g. a draft starting fires player-lookups for 10 accounts at once). With caching, sustained rate is already safe; the queue mainly smooths bursts so no single second exceeds the upstream's tolerance and 429s become rare.
- Stratz at 500/hr is the binding constraint. `intervalCap:1, interval:1000` caps Stratz at ≤3600/hr *theoretical*, but the 60s winprob TTL caps actual calls far lower; the queue exists so that if many matches are open simultaneously, requests serialize and 429s back off cleanly rather than hammering.
- If the owner expects to watch **many simultaneous matches**, lower Stratz `intervalCap` further or raise the winprob TTL. These are tunable; start conservative.

## Common Pitfalls

### Pitfall 1: Stale-on-exhaustion reads an evicted key
**What goes wrong:** D-03 says "return stale cache if present in Redis." But the fresh cache key is written with `EX ttlSeconds` — once TTL passes, Redis deletes it, and a 429 storm happens precisely when the key has expired (that's why a fetch was attempted). So a naive `redis.get(key)` returns `null` and the fallback never fires.
**Why it happens:** Single-key design conflates "fresh" and "available."
**How to avoid:** On every success, write **two** copies: `key` with the normal TTL, and `stale:<key>` with a long TTL (e.g. 24h). The 429-exhaustion path reads `stale:<key>`. Confirm the chosen long TTL with the owner.
**Warning signs:** Test simulating "TTL expired + upstream 429" returns 503 instead of stale data.

### Pitfall 2: p-retry retries everything by default
**What goes wrong:** Without `shouldRetry`, a ZodError (schema drift) or a 404 gets retried 4× with backoff — wasting time and (for rate-checked upstreams) quota, and delaying the user-facing error.
**How to avoid:** `shouldRetry: ({ error }) => isRateLimited(error)` — only 429 (and maybe 503/network). Use `AbortError` to hard-stop on non-retryable errors. `[CITED: p-retry readme — AbortError "No callback functions will be called"]`
**Warning signs:** Slow error responses; quota burn during outages.

### Pitfall 3: react-error-boundary v4→v6 API drift
**What goes wrong:** The client pins `^4.0.0`. v5 renamed `useErrorHandler` → `useErrorBoundary` and adjusted `onReset` details. Copying a v4 snippet under v6 (or vice-versa) breaks.
**How to avoid:** Install `^6`, use `FallbackComponent`/`fallbackRender` + `resetKeys` + `useErrorBoundary`. `[VERIFIED: registry peerDeps react ^18||^19]`
**Warning signs:** `useErrorHandler is not exported` build error.

### Pitfall 4: Error boundaries don't catch async/event errors
**What goes wrong:** React error boundaries catch errors during **render**, not in event handlers, async callbacks, or `setTimeout`. A failed fetch inside a handler won't trigger the boundary.
**Why it matters here:** Most data errors are already handled by TanStack Query (`isError`) and surfaced in-component, not thrown during render. The boundaries primarily catch **render-time** crashes (e.g. a malformed payload that a component indexes into — like the IntelTooltip example in D-05).
**How to avoid:** For async errors that *should* surface a boundary, use `useErrorBoundary().showBoundary(err)`. Otherwise rely on Query's error state.

### Pitfall 5: CORS origin mismatch (trailing slash / preview URLs)
**What goes wrong:** `origin: 'https://app.vercel.app/'` (trailing slash) never matches the browser's `Origin: https://app.vercel.app` header → silent CORS failure. Vercel preview deploys also have different subdomains.
**How to avoid:** No trailing slash. Use an env var; for previews, an `origin` **function** that allows the prod URL and `*.vercel.app` if needed. `[CITED: hono.dev cors docs — origin can be a function]`

### Pitfall 6: `VITE_API_URL` not inlined / changed after build
**What goes wrong:** `VITE_*` vars are inlined at **build time**. Setting it in Vercel *after* a build, or expecting it at runtime, leaves the value `undefined`. Also, only `VITE_`-prefixed vars are exposed to client code.
**How to avoid:** Set `VITE_API_URL` in Vercel project env **before** building; redeploy to pick up changes. Document this in DEPLOY.md. `[CITED: Vercel/Vite env docs]`

### Pitfall 7: Railway PORT binding
**What goes wrong:** Railway injects `PORT`; if the app binds a hardcoded port, the healthcheck and routing fail. The BFF already reads `Number(env.PORT)` (good) — just ensure `PORT` is **not** force-set in `.env.production` to a fixed value that conflicts.
**How to avoid:** Let Railway provide `PORT`; the health route `/api/health` already exists — point `healthcheckPath` at it.

## Deploy Configs

### `railway.json` (BFF — Nixpacks)
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm run start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 60,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```
> `[CITED: docs.railway.com/reference/config-as-code]` Fields: `build.builder` (`NIXPACKS` still supported though `RAILPACK` is the 2026 default — CONTEXT locked Nixpacks), `build.buildCommand`, `deploy.startCommand`, `deploy.healthcheckPath`, `deploy.healthcheckTimeout`, `deploy.restartPolicyType`, `deploy.restartPolicyMaxRetries`.
> **Note:** The existing server `start` script is `node --env-file=.env dist/index.js`. On Railway, env vars come from the dashboard, **not** a `.env` file — adjust the production start to `node dist/index.js` (no `--env-file`) or ensure Railway-provided env is read directly via `process.env`. The planner must reconcile this. `[VERIFIED: server/package.json]`

**Railway env vars (set in dashboard, not committed):** `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN`, `VALVE_API_KEY`, `STRATZ_TOKEN`, `CORS_ORIGIN` (the Vercel URL), `NODE_ENV=production`. `PORT` is injected by Railway.

### `vercel.json` (frontend — Vite SPA)
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```
> `[CITED: Vercel community + docs]` The SPA rewrite sends every path to `index.html` so React Router v7 deep links (e.g. `/match/123`) survive a hard refresh. Vite's default output dir is `dist`. Do **not** enable `cleanUrls` (interferes with the rewrite).
> **Project root note:** the client is a sub-folder (`client/`). The Vercel project's **Root Directory** should be set to `client/` (dashboard setting), with `vercel.json` placed in `client/`. The planner should confirm the monorepo layout and whether `vercel.json` lives at repo root or `client/`.

**Vercel env var (set before build):** `VITE_API_URL = https://<railway-app>.up.railway.app` (no trailing slash, no `/api`).

### CORS change in `index.ts`
```ts
// was: app.use('*', cors({ origin: 'http://localhost:5173' }))
app.use('/api/*', cors({
  origin: env.CORS_ORIGIN ?? 'http://localhost:5173',  // exact Vercel URL in prod
  // credentials stays false — no auth/cookies in v1
}))
```
Add `CORS_ORIGIN` to `env.ts` schema (optional, defaulting to localhost). `[CITED: hono.dev/docs/middleware/builtin/cors]`

### `.env.production.example` (extends `.env.example`)
```
# === BFF (Railway dashboard env) ===
# PORT is injected by Railway — do NOT set.
UPSTASH_REDIS_URL=rediss://your-instance.upstash.io:6380
UPSTASH_REDIS_TOKEN=your-token
VALVE_API_KEY=your-valve-key
STRATZ_TOKEN=your-stratz-token
CORS_ORIGIN=https://your-app.vercel.app
NODE_ENV=production

# === Frontend (Vercel build-time env) ===
VITE_API_URL=https://your-bff.up.railway.app
```

### Upstash + ioredis (no code change required)
The existing `cache.ts` already builds `rediss://:${TOKEN}@${host}` with `tls: {}` — correct for Upstash. Because the BFF is a **long-lived Railway process** (not a serverless function), persistent ioredis connections are appropriate; the "use the HTTP REST client in serverless" advice does **not** apply here. `maxRetriesPerRequest: 1` + graceful null-on-failure already degrades correctly. `[VERIFIED: server/src/cache.ts]` `[CITED: upstash.com/docs/redis/howto/connect-client]`

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x (server + client both use `"test": "vitest"`) |
| Config file | none explicit — Vite/Vitest defaults; client uses jsdom (`@testing-library/react`, `jsdom` in devDeps) |
| Quick run command (server) | `cd server && npx vitest run src/cache.test.ts` |
| Quick run command (client) | `cd client && npx vitest run src/hooks` |
| Full suite command | `cd server && npm test -- --run` and `cd client && npm test -- --run` |

### Criterion → Observable Signal → Test Map
| Criterion | Observable signal that proves it | Test type | Automated command | File status |
|-----------|----------------------------------|-----------|-------------------|-------------|
| **1. Per-card error isolation** | A card whose child throws renders the `BentoFallback` (Retry button present) while sibling cards still render | component (RTL) | `cd client && npx vitest run src/components/BentoErrorBoundary.test.tsx` | ❌ Wave 0 |
| **1b. Retry re-mounts** | After clicking Retry, the boundary clears and re-renders children | component (RTL) | same file | ❌ Wave 0 |
| **2a. Queue throttles per upstream** | With queue `intervalCap`, calls beyond cap are deferred (timing/order assertion); each upstream uses its own queue | unit | `cd server && npx vitest run src/queues.test.ts` | ❌ Wave 0 |
| **2b. 429 → exponential backoff** | On simulated 429, `fn` is retried with increasing delay, then succeeds; non-429 is NOT retried | unit (fake timers) | `cd server && npx vitest run src/cache.test.ts` | ⚠️ extend existing cache.test.ts |
| **2c. Structured throttle log shape** | Each throttle emits one pino record with `{ upstream, attempt, retriesLeft, status, delayMs }` | unit (spy on logger) | `cd server && npx vitest run src/cache.test.ts` | ⚠️ extend |
| **2d. Exhaustion → stale-then-503** | After retries exhausted: returns `stale:<key>` value if present; returns 503 (rethrow) if absent | unit | `cd server && npx vitest run src/cache.test.ts` | ❌ Wave 0 |
| **3. Polling stops at game_state===6** | `computeWinProbInterval(6,_)===false`, `computeDraftInterval(6)===false`, `computeIntelInterval(6)===false`, and `useMatchDetail` sets `refetchInterval:false` | unit (pure helpers) | `cd client && npx vitest run src/hooks` | ⚠️ helpers exist; assert the ===6 case explicitly |
| **4. Deploy / shareable URL** | `railway.json` + `vercel.json` valid; `/api/health` returns 200; SPA deep link `/match/:id` returns index.html | manual + smoke | manual per DEPLOY.md; optional health-route test exists (`index.test.ts`) | manual |

### Sampling Rate
- **Per task commit:** the matching quick-run command for the file touched.
- **Per wave merge:** `npm test -- --run` in the affected package (server or client).
- **Phase gate:** both suites green + a manual deploy smoke (shareable URL loads live list, deep-link refresh works) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `server/src/queues.ts` + `server/src/queues.test.ts` — per-upstream queue config + throttle behavior (criterion 2a).
- [ ] Extend `server/src/cache.test.ts` — 429 retry/backoff, `shouldRetry` gating, throttle-log shape, stale-then-503 exhaustion (criterion 2b/2c/2d). Existing ioredis mock pattern (lines 4–25) is reusable.
- [ ] `client/src/components/BentoErrorBoundary.tsx` + `BentoErrorBoundary.test.tsx` — fallback render + Retry reset + sibling isolation (criterion 1).
- [ ] Polling-stop tests: the pure helpers (`computeDraftInterval`, `computeWinProbInterval`, `computeIntelInterval`) already exist with test files — add/confirm an explicit `game_state===6 → false` assertion in each, and add a `useMatchDetail` test asserting `refetchInterval` is false for a post-game match (D-11).
- [ ] Framework install: none — Vitest already present in both packages.

*(Existing test files confirmed: `cache.test.ts`, `useWinProbability.test.ts`, `useDraftDetail.test.ts`, `useMatchIntel.test.ts`, `index.test.ts`.)*

## Security Domain

> `security_enforcement` default = enabled. This is a hardening phase, so security is central.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | No auth in v1 (locked, PROJECT.md) |
| V3 Session Management | no | No sessions/cookies |
| V4 Access Control | no | Public read-only tool, no per-user data |
| V5 Input Validation | yes | zod schemas already parse every upstream response (`.passthrough()` for Valve). `matchId` from URL is used in cache keys/upstream calls — keep numeric/string coercion strict. |
| V6 Cryptography | partial | TLS to Upstash (`rediss://`) already enforced; secrets in env, never logged |
| V7 Error Handling & Logging | yes | pino structured logs; **never log API keys / Redis token / Stratz token** (existing services already log status-only — preserve this in the new throttle logs) |
| V9/V13 Communications / API | yes | CORS restricts origin to the Vercel URL; HTTPS on both Vercel and Railway by default |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret leakage in logs (API keys, Redis token) | Information Disclosure | Throttle logs include `upstream`/`status`/`attempt` only — **no URL, no key**. Mirror existing `[stratzApi] status only` discipline. |
| CORS misconfig (`*` + credentials, or wildcard origin) | Spoofing / Info Disclosure | Exact Vercel origin via env; `credentials: false`; scope to `/api/*` |
| Quota exhaustion / DoS via cache-miss storm | Denial of Service | Per-upstream p-queue + 429 backoff + stale-cache fallback (the phase's core) |
| Open redirect / SPA rewrite abuse | Tampering | SPA rewrite only serves static `index.html`; no server-side redirect logic |
| Error-boundary leaking stack traces to UI | Information Disclosure | `BentoFallback` shows a generic "Couldn't load" message; `onError` logs the stack to console/server only, never renders it |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Bottleneck / hand-rolled limiter | p-queue + p-retry (composable, ESM) | ongoing | Smaller surface; CONTEXT-locked |
| react-error-boundary `useErrorHandler` (v4) | `useErrorBoundary` (v5+) | v5 (2024) → v6 current | Must bump client dep + use new hook name |
| Railway **Nixpacks** default | **Railpack** default builder | beta Mar 2026 | Nixpacks still supported; CONTEXT locked Nixpacks — set `"builder": "NIXPACKS"` explicitly |
| Single-key cache (fresh only) | Fresh + long-lived stale copy | this phase | Required for D-03 stale-on-exhaustion |

**Deprecated/outdated:**
- `react-error-boundary` v4 `useErrorHandler` export — renamed in v5+.
- Relying on Railway's *implicit* Nixpacks default — now explicit (`RAILPACK` is default), so set `builder` in `railway.json`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Recommended p-queue numbers (Valve 5/s cap, OpenDota 2/s, Stratz 1/s) keep each upstream under quota given existing TTLs | Queue Config Math | Too tight → spurious 429s/backoff; too loose → quota exhaustion. Tunable; start conservative, confirm with owner's expected concurrent-match count. |
| A2 | Stale-cache long-TTL of ~24h is acceptable for D-03 fallback | Pitfall 1 | Stale data served during outage could be very old; owner may want a shorter cap or a "stale" UI badge. |
| A3 | The owner watches a small number of simultaneous matches (Stratz 500/hr is comfortable) | Queue Config Math | Many concurrent matches could blow the Stratz budget regardless of queue; may need higher winprob TTL. |
| A4 | `vercel.json` lives in `client/` with Vercel Root Directory = `client/` (monorepo layout) | Deploy Configs | Wrong root → build fails; planner must confirm repo layout. |
| A5 | Railway env is read via `process.env` directly (production start drops `--env-file=.env`) | railway.json note | If start keeps `--env-file=.env`, Railway dashboard env won't load and `env.ts` throws on boot. |
| A6 | `Retry-After` honoring via `onFailedAttempt` sleep is acceptable even though it's additive to p-retry's own backoff | Pattern 2 | Slightly longer waits than the server asked; acceptable for a read-only tool. p-retry has no native delay-override. |
| A7 | Per-card boundaries primarily catch render-time crashes (most data errors already handled by Query `isError`) | Pitfall 4 | If a widget throws asynchronously, it won't hit the boundary without `showBoundary()`; some cards may need explicit wiring. |

## Open Questions

1. **Stale-on-exhaustion storage shape (D-03)**
   - What we know: D-03 requires "return stale cache if present." The current single TTL'd key is evicted on expiry.
   - What's unclear: long-TTL value (24h? until next success?) and whether to surface a "stale" indicator to the UI.
   - Recommendation: write `stale:<key>` with a generous TTL; planner/owner picks the number. Consider a response header or field so the client can badge stale data (optional, low cost).

2. **Production start command on Railway (A5)**
   - What we know: server `start` is `node --env-file=.env dist/index.js`; Railway provides env via dashboard.
   - Recommendation: add a separate prod start (`node dist/index.js`) or make `--env-file` optional; verify `env.ts` boot succeeds with dashboard-injected vars.

3. **Monorepo deploy roots (A4)**
   - What we know: client and server are sibling folders; deploy targets differ.
   - Recommendation: Railway Root = `server/` (or repo root with build/start pointing into server), Vercel Root = `client/`. Confirm exact layout before writing configs.

4. **Vercel preview deploys + CORS**
   - What we know: each Vercel preview has a unique `*.vercel.app` subdomain.
   - Recommendation: if previews must hit the prod BFF, use a CORS `origin` function allowing the prod URL and `*.vercel.app`; otherwise restrict to the single prod URL.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | BFF runtime / build | ✓ (project target) | 24 LTS | — (p-retry needs ≥22) |
| npm registry (p-queue, p-retry) | D-01 install | ✓ | p-queue 9.3.0 / p-retry 8.0.0 | — |
| react-error-boundary | D-05/06 | ✓ (dep present, bump to ^6) | 6.1.2 | hand-rolled class (not recommended) |
| Railway account + project | Deploy BFF | ✗ (owner action) | — | none — owner must create |
| Vercel account + project | Deploy frontend | ✗ (owner action) | — | none — owner must create |
| Upstash Redis instance | Cache in prod | ✗ (owner action) | — | none — required; cache degrades to null without it (BFF still runs) |

**Missing dependencies with no fallback:** Railway/Vercel/Upstash accounts — these are manual owner steps documented in DEPLOY.md (D-10), not code blockers. Hardening waves (boundaries, queue, polling) need none of them and can be built + tested locally first (D-12).

## Sources

### Primary (HIGH confidence)
- `npm view` registry — p-queue 9.3.0, p-retry 8.0.0, react-error-boundary 6.1.2, hono 4.12.25, ioredis 5.11.1; ESM/engines/peerDeps verified.
- github.com/sindresorhus/p-queue (readme) — constructor options, `intervalCap`/`interval`/`concurrency`, `queue.add`.
- github.com/sindresorhus/p-retry (readme) — options list, `onFailedAttempt` shape, AbortError, no native delay-override.
- github.com/bvaughn/react-error-boundary (readme) — `FallbackComponent`/`resetKeys`/`onError`/`useErrorBoundary`.
- hono.dev/docs/middleware/builtin/cors — origin/credentials/preflight.
- docs.railway.com/reference/config-as-code — railway.json schema, build/deploy fields.
- Codebase: cache.ts, logger.ts, index.ts, the 5 client poller hooks, MatchPage.tsx, index.css `.bento-card`, env.ts, package.json (client+server), .env.example, sketch-findings-dota-stats skill.

### Secondary (MEDIUM confidence)
- blog.railway.com/p/introducing-railpack — Railpack now default; Nixpacks still supported (2026).
- upstash.com/docs/redis/howto/connect-client — ioredis + rediss TLS; serverless-vs-persistent guidance.
- Vercel community threads — SPA rewrite to `/index.html` for Vite + React Router deep links.

### Tertiary (LOW confidence)
- Quota-to-queue-number mapping (A1–A3) — reasoned from documented quotas + existing TTLs; no external source confirms exact PQueue numbers for this workload. Flagged in Assumptions Log for owner confirmation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions, ESM, peerDeps all verified against registry; APIs from current readmes.
- Architecture: HIGH — derived from reading the actual `cached()` chokepoint, pollers, and bento layout.
- Queue config numbers: MEDIUM-LOW — reasoned recommendations, flagged for owner confirmation (A1–A3).
- Deploy configs: MEDIUM-HIGH — schema fields cited from current docs; monorepo root + Railway start-command nuances flagged (A4/A5).
- Pitfalls: HIGH — stale-key eviction and p-retry-retries-everything are concrete and verified.

**Research date:** 2026-06-14
**Valid until:** ~2026-07-14 (stable libs; Railway builder landscape is shifting — re-confirm Nixpacks support if deploying later).
