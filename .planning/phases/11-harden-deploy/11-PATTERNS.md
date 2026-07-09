# Phase 11: Harden & Deploy - Pattern Map

**Mapped:** 2026-06-14
**Files analyzed:** 18 (new + modified + reference)
**Analogs found:** 16 / 18 (2 deploy-config files have no in-repo analog by design)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server/src/queues.ts` (NEW) | config | request-response | `server/src/cache.ts` (TTL const-export block) | role-match (const-export module) |
| `server/src/cache.ts` (MODIFY) | service | request-response | itself — `cached()` lines 54-83 | exact (modify in place) |
| `server/src/logger.ts` (MODIFY) | utility | event-driven | itself + `index.ts` `logger.info({...},'msg')` | exact (extend in place) |
| `server/src/services/stratzApi.ts` (REFERENCE/MODIFY) | service | request-response | itself — already routes via `cached()` | exact |
| `server/src/services/valveApi.ts` (REFERENCE/MODIFY) | service | request-response | itself — already routes via `cached()` | exact |
| `server/src/services/openDotaApi.ts` (REFERENCE/MODIFY) | service | request-response | itself — already routes via `cached()` | exact |
| `server/src/index.ts` (MODIFY — CORS) | config | request-response | itself line 12 `app.use('*', cors(...))` | exact |
| `server/src/env.ts` (MODIFY — add CORS_ORIGIN) | config | request-response | itself `EnvSchema` lines 3-9 | exact |
| `server/src/queues.test.ts` (NEW) | test | request-response | `server/src/cache.test.ts` | role-match (unit, vi mocks) |
| `server/src/cache.test.ts` (MODIFY) | test | request-response | itself — ioredis mock lines 3-25 | exact (extend) |
| `client/src/components/BentoErrorBoundary.tsx` (NEW) | component | event-driven | `MatchBentoGrid.tsx` + `ErrorBanner.tsx` + `.bento-card` CSS | role-match (bento surface + fallback copy) |
| `client/src/components/BentoErrorBoundary.test.tsx` (NEW) | test | event-driven | `client/src/components/RoshanBlock.test.tsx` | exact (RTL render/screen) |
| `client/src/pages/MatchPage.tsx` (MODIFY) | page | request-response | itself — `.bento-card` wrapper blocks | exact (wrap children) |
| `client/src/App.tsx` (MODIFY) | route | request-response | itself — `<Routes>`/`<Route>` lines 5-12 | exact (wrap route elements) |
| `client/src/lib/apiBase.ts` (NEW) | utility | request-response | `client/src/utils/*` (const-export helpers) | role-match (tiny pure helper) |
| `client/src/hooks/*.ts` (MODIFY — fetch base) | hook | request-response | `useWinProbability.ts` `fetchWinProb` line 31 | exact (6 identical fetch calls) |
| `railway.json` (NEW) | config | — | — | no analog (use RESEARCH §Deploy Configs) |
| `vercel.json`, `.env.production.example`, `DEPLOY.md` (NEW) | config | — | `.env.example` (repo root) for the env file | partial (.env.example only) |

---

## Pattern Assignments

### `server/src/queues.ts` (NEW — config, three PQueue instances)

**Analog:** `server/src/cache.ts` lines 33-39 — the `TTL` const-export block is the template for a small "config constants + named exports" module. Mirror its doc-comment + `as const` style; export three named queue instances instead of a constant object.

**Import shape to mirror** (cache.ts line 2 — `.js` extension on local imports under `"type":"module"`):
```ts
import { env } from './env.js'   // local imports ALWAYS end in .js
```

**Target shape** (from RESEARCH Pattern 1, lines 161-169 — verify the numbers against Queue Config Math table, lines 295-299):
```ts
import PQueue from 'p-queue'   // pure-ESM default export
export const valveQueue    = new PQueue({ concurrency: 2, interval: 1000, intervalCap: 5 })
export const openDotaQueue = new PQueue({ concurrency: 2, interval: 1000, intervalCap: 2 })
export const stratzQueue   = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 1 })
```

---

### `server/src/cache.ts` (MODIFY — service, request-response) — THE key change site

**Analog:** itself. This is the single upstream chokepoint (CLAUDE.md). Queue + pRetry + stale-copy insert here. **Exact current implementation below so the planner knows precisely where each piece goes.**

**Current full `cached()` body (lines 54-83) — modify in place:**
```ts
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  if (redis) {
    try {
      const hit = await redis.get(key)
      if (hit !== null) {
        return JSON.parse(hit) as T          // ← HIT path: unchanged
      }
    } catch (err) {
      console.error(`[cache] GET error for key "${key}":`, (err as Error).message)
      // Fall through to fn() — graceful degradation
    }
  }

  const result = await fn()                   // ← MISS path: WRAP this in queue.add(()=>pRetry(fn,...))

  if (redis) {
    try {
      await redis.set(key, JSON.stringify(result), 'EX', ttlSeconds)  // ← also write stale:<key> w/ long TTL here
    } catch (err) {
      console.error(`[cache] SET error for key "${key}":`, (err as Error).message)
    }
  }

  return result
}
```

**Insertion map (per RESEARCH Pattern 1, lines 177-210, and Pitfall 1):**
1. Extend the signature with `opts?: { queue?: PQueue; upstream?: string }` (4th param — backward-compatible; existing 3-arg call sites unchanged).
2. Replace `const result = await fn()` with `const result = opts?.queue ? await opts.queue.add(run) : await run()` where `run = () => pRetry(fn, {...shouldRetry, onFailedAttempt})`.
3. After the successful `redis.set(key,...)`, also `redis.set('stale:'+key, JSON.stringify(result), 'EX', LONG_TTL)` (long TTL e.g. 24h — separate key because the fresh key is evicted at `ttlSeconds`, RESEARCH Pitfall 1).
4. Wrap the MISS block in `try/catch`; on catch, `redis.get('stale:'+key)` → return parsed stale if present, else rethrow (route emits 503).

**Existing `.js`-import convention to follow for the new imports:**
```ts
import pRetry from 'p-retry'
import type PQueue from 'p-queue'
import { logThrottle } from './logger.js'   // local → .js
```

**TTL constants block to extend (lines 33-39)** — add a `STALE` long-TTL constant alongside the existing ones, same `as const` object:
```ts
export const TTL = {
  LIVE_MATCH: 30,
  DRAFT: 4,
  HERO_STATS: 21_600,
  PLAYER_STATS: 900,
  WIN_PROB: 60,
  // STALE: 86_400,  ← add (24h stale copy for D-03 fallback)
} as const
```

---

### `server/src/logger.ts` (MODIFY — utility, event-driven)

**Analog:** itself (the existing pino instance) + the structured-log call style already used in `index.ts` line 35 (`logger.info({ signal }, 'shutdown initiated')`).

**Current full file (lines 1-13) — extend, do not replace:**
```ts
import pino from 'pino'
export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: undefined,
})
```

**Add a `logThrottle()` helper (D-04). Field shape per RESEARCH criterion 2c, line 426 — `{ upstream, attempt, retriesLeft, status, delayMs }`. SECURITY (RESEARCH §Security, line 463): NO url, NO key/token — status only, mirroring the existing `[stratzApi] status only` discipline:**
```ts
export function logThrottle(fields: {
  upstream: string; attempt: number; retriesLeft: number;
  status?: number; delayMs?: number | null;
}): void {
  logger.warn(fields, 'upstream throttle')   // object-first, message-second — same as index.ts line 35
}
```

---

### `server/src/services/{valve,openDota,stratz}Api.ts` (REFERENCE/MODIFY — service, request-response)

**Analog:** each other. All three already route every upstream call through `cached()` and never call `fetch` outside it (CLAUDE.md honored). The ONLY change is passing the right queue + upstream label into the (newly extended) `cached()` 4th arg.

**Current call-site shape (the only edit per service) — `valveApi.ts` lines 25-27:**
```ts
export function getLiveLeagueGames(): Promise<LiveLeagueGames> {
  return cached('live_games', TTL.LIVE_MATCH, fetchLiveLeagueGames)
  //                                                                  ↑ add 4th arg: { queue: valveQueue, upstream: 'valve' }
}
```
- `valveApi.ts` → `{ queue: valveQueue, upstream: 'valve' }` (2 call sites: `getLiveLeagueGames`, `getLiveLeagueGamesFast`).
- `openDotaApi.ts` → `{ queue: openDotaQueue, upstream: 'opendota' }` (3 call sites: `getLeagueName`, `getHeroStats`, `getPlayerHeroes`).
- `stratzApi.ts` → `{ queue: stratzQueue, upstream: 'stratz' }` (2 call sites: `getWinProbability`, `getHeroMatchupsStratz`).

**Retry-After plumbing (RESEARCH Pattern 2, lines 214-217):** the `fetch` body in each `fetchXxx()` must, on a 429, read `res.headers.get('retry-after')`, parse seconds-or-HTTP-date, and attach to the thrown error (`err.retryAfterMs`, `err.status = 429`) so `cached()`'s `shouldRetry`/`onFailedAttempt` can gate + honor it. **Current 429-relevant shapes:**
- `valveApi.ts` line 11-13 **throws** on `!res.ok` (`throw new Error('Valve API error: ...')`) — extend to attach status/retryAfterMs.
- `stratzApi.ts` lines 44-48 / 112-115 and `openDotaApi.ts` **return null** on `!res.ok` — these need a 429 branch that *throws* a rate-limit error (so pRetry can retry) while keeping the existing null-return for non-429 failures (Stratz is `value | null` per CLAUDE.md — preserve that for genuine errors).

---

### `server/src/index.ts` (MODIFY — CORS, config)

**Analog:** itself, line 12. Single-line change from hardcoded localhost to env-driven origin scoped to `/api/*`.

**Current (line 12):**
```ts
app.use('*', cors({ origin: 'http://localhost:5173' }))
```

**Target (RESEARCH lines 382-388 + Pitfall 5 no-trailing-slash):**
```ts
app.use('/api/*', cors({
  origin: env.CORS_ORIGIN ?? 'http://localhost:5173',  // credentials stays false (no auth v1)
}))
```
`env` is already imported (line 4). No new import.

---

### `server/src/env.ts` (MODIFY — add CORS_ORIGIN)

**Analog:** itself, `EnvSchema` lines 3-9. Add one optional field mirroring the existing `z.string()` entries (use `.optional()` so localhost default in `index.ts` applies in dev — do not make it `.min(1)` required or local boot breaks):
```ts
CORS_ORIGIN: z.string().optional(),   // the exact Vercel URL in prod (no trailing slash)
```

---

### `server/src/queues.test.ts` (NEW — test)

**Analog:** `server/src/cache.test.ts` — same Vitest + `vi.mock('./env.js', ...)` + dynamic `await import('./...js')` conventions.

**Reusable scaffold from cache.test.ts (lines 1, 17-25):**
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('./env.js', () => ({ env: { /* PORT, UPSTASH_*, VALVE_API_KEY, STRATZ_TOKEN */ } }))
// ... await import('./queues.js') inside beforeEach/it
```
Assert per criterion 2a (RESEARCH line 424): with `intervalCap`, calls beyond the cap are deferred (timing/order assertion); each upstream uses a distinct queue instance.

---

### `server/src/cache.test.ts` (MODIFY — extend)

**Analog:** itself. The ioredis mock (lines 3-15) and the `mockRedisInstance` reset pattern (lines 4-8, 49-54) are directly reusable for the new 429/stale cases.

**Reusable ioredis mock (lines 3-15) — extend `mockRedisInstance` with whatever stale-read needs (it already has `get`/`set`/`on`):**
```ts
const mockRedisInstance = { get: vi.fn(), set: vi.fn(), on: vi.fn() }
vi.mock('ioredis', () => {
  const RedisMock = vi.fn(function () { return mockRedisInstance })
  return { Redis: RedisMock, default: RedisMock }
})
```

**Existing test-case template to copy for new cases (lines 71-81 — miss → fn called → set verified):**
```ts
it('calls fn() on cache miss and stores result in Redis', async () => {
  mockRedis.get.mockResolvedValueOnce(null)
  mockRedis.set.mockResolvedValueOnce('OK')
  const fn = vi.fn().mockResolvedValue({ data: 'fresh' })
  const result = await cachedFn('test-key', 30, fn)
  expect(mockRedis.set).toHaveBeenCalledWith('test-key', JSON.stringify({ data: 'fresh' }), 'EX', 30)
})
```
Add cases (RESEARCH criteria 2b/2c/2d, lines 425-427): 429 → retried with backoff then succeeds (fake timers); non-429 NOT retried (`shouldRetry` gating); throttle emits one `logThrottle` record (spy on logger); exhaustion → `stale:<key>` returned if present, else rethrow (503). The `env.js` mock (lines 18-25) must add `STRATZ_TOKEN` since `env.ts` now requires it.

---

### `client/src/components/BentoErrorBoundary.tsx` (NEW — component, event-driven)

**Analog (surface):** `.bento-card` CSS in `client/src/index.css` lines 57-69. **Analog (fallback copy/style):** `ErrorBanner.tsx` (the existing "Couldn't load..." pattern). **Analog (layout):** `MatchBentoGrid.tsx` for how cards compose.

**`.bento-card` surface to reuse (index.css lines 57-63) — the fallback uses the same class so a failed widget looks intentional:**
```css
.bento-card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.125rem;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
```

**Existing fallback copy pattern (`ErrorBanner.tsx`) — mirror the tone ("Couldn't load …"), but render inside `.bento-card`, not the red danger banner:**
```tsx
<p className="font-semibold">Couldn't load live matches.</p>
```

**Target component (RESEARCH Pattern 3, lines 223-256) — uses react-error-boundary v6 (`FallbackComponent`/`resetErrorBoundary`/`resetKeys`/`onError`). NOTE: client `package.json` line 19 pins `^4.0.0` → MUST bump to `^6` (v5 renamed `useErrorHandler`→`useErrorBoundary`):**
```tsx
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
      >Retry</button>
    </div>
  )
}
export function BentoErrorBoundary({ children, resetKeys }: { children: ReactNode; resetKeys?: unknown[] }) {
  return (
    <ErrorBoundary FallbackComponent={BentoFallback} resetKeys={resetKeys}
      onError={(error, info) => console.error('[bento-boundary]', error, info.componentStack)}>
      {children}
    </ErrorBoundary>
  )
}
```
Style tokens (`text-text-dim`, `text-text`, `hover:text-primary`, the `text-[11px] uppercase tracking-[…]` button) are the SAME ones `MatchPage.tsx` uses for its back-nav (lines 47-49) — copy that exact button idiom for visual consistency.

---

### `client/src/components/BentoErrorBoundary.test.tsx` (NEW — test, RTL)

**Analog:** `client/src/components/RoshanBlock.test.tsx` lines 1-3, 9-16 — the canonical RTL component-test convention in this repo (`render`, `screen`, `act`, `afterEach(() => vi.useRealTimers())`).

**Scaffold to copy (RoshanBlock.test.tsx lines 1-3):**
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
```
Assert (criteria 1/1b, RESEARCH lines 422-423): a child that throws renders `BentoFallback` (Retry button present via `screen.getByRole('button', {name:/retry/i})`) while a sibling still renders; clicking Retry re-mounts children. Use a `<Thrower/>` test component that throws during render.

---

### `client/src/pages/MatchPage.tsx` (MODIFY — page, wrap bento cards)

**Analog:** itself. Each existing `<div className="bento-card …">…</div>` block (lines 67, 96, 119, 127, 135, 148, 155, 161) gets its children wrapped in `<BentoErrorBoundary resetKeys={[matchId]}>`. `matchId` is already in scope (line 20, `useParams()`). Pass `resetKeys={[matchId]}` so navigating to a new match clears a stuck boundary (RESEARCH line 255).

**Representative wrap target (lines 119-126):**
```tsx
<div className="bento-card min-w-0 stack:flex-1">
  <HeroPlayerGrid radiantPlayers={radiantPlayers} direPlayers={direPlayers} ... />
</div>
// → wrap the inner child in <BentoErrorBoundary resetKeys={[matchId]}>...</BentoErrorBoundary>
```

---

### `client/src/App.tsx` (MODIFY — route, top-level backstop)

**Analog:** itself, lines 5-12. Wrap each `element={…}` in a route-level boundary (D-07 backstop). The simplest mirror: wrap each page element in `<BentoErrorBoundary>` (or a route-level variant) — keep the `<Routes>/<Route>` structure unchanged:
```tsx
<Route path="/" element={<BentoErrorBoundary><HomePage /></BentoErrorBoundary>} />
<Route path="/match/:matchId" element={<BentoErrorBoundary><MatchPage /></BentoErrorBoundary>} />
```

---

### `client/src/lib/apiBase.ts` (NEW — utility, base URL)

**Analog:** the tiny pure const-export helpers in `client/src/utils/*` (e.g. `winrateColor.ts`, `formatNW.ts` — single exported function/const, unit-tested). Same module shape, new `lib/` folder.

**Target (RESEARCH Pattern 4, lines 264-268) — Vite inlines `VITE_*` at BUILD time; empty string keeps the dev proxy working:**
```ts
export const API_BASE = import.meta.env.VITE_API_URL ?? ''
// usage:  fetch(`${API_BASE}/api/live/games`)
```

---

### `client/src/hooks/*.ts` (MODIFY — 6 identical fetch refactors)

**Analog:** `useWinProbability.ts` `fetchWinProb` (line 31) — all six pollers share the EXACT same `fetch('/api/...')` + `!res.ok` throw idiom. Switch each to `${API_BASE}/api/...`.

**Current shape (identical across all 6 — useWinProbability.ts lines 30-34):**
```ts
async function fetchWinProb(matchId: string): Promise<WinProbResponse> {
  const res = await fetch(`/api/live/winprob/${matchId}`)
  if (!res.ok) throw new Error(`BFF error: ${res.status}`)
  return res.json() as Promise<WinProbResponse>
}
```
**Exact call sites to update (confirmed via grep):**
| File | Line | Current |
|------|------|---------|
| `useDraftDetail.ts` | 32 | `fetch(`/api/live/draft/${matchId}`)` |
| `useHeroStats.ts` | 13 | `fetch('/api/heroes/stats')` |
| `useLiveGames.ts` | 61 | `fetch('/api/live/games')` |
| `useMatchDetail.ts` | 34 | `fetch('/api/live/games')` |
| `useMatchIntel.ts` | 39 | `fetch(`/api/live/intel/${matchId}`)` |
| `useWinProbability.ts` | 31 | `fetch(`/api/live/winprob/${matchId}`)` |
Each becomes `fetch(`${API_BASE}/api/...`)` with `import { API_BASE } from '../lib/apiBase'`. In dev leave `VITE_API_URL` unset → `''` → existing Vite proxy (`vite.config.ts` lines 13-21) keeps working.

---

### Polling-stop verification (D-11 — REFERENCE/MODIFY, no new mechanism)

The three pure helpers already encode the `game_state === 6 → false` guard and already have test files. **Confirm/add an explicit `===6` assertion in each:**

| Helper | File:line | Guard already present |
|--------|-----------|------------------------|
| `computeWinProbInterval` | `useWinProbability.ts:25` | `if (gameState === 6) return false` (FIRST guard) — test line 11 already asserts it |
| `computeDraftInterval` | `useDraftDetail.ts:48-51` | `gameState===2→5000` else `false` (covers 6) — add explicit `===6` assertion |
| `computeIntelInterval` | `useMatchIntel.ts:33-36` | same `2→5000` else `false` — add explicit `===6` assertion |
| `useMatchDetail` (inline) | `useMatchDetail.ts:39` | `refetchInterval: matchFromCache?.game_state === 6 ? false : 30_000` — add an RTL/integration test asserting `false` for a post-game match (D-11) |

**Test analog for the pure-helper assertions:** `useWinProbability.test.ts` lines 10-12 (the exact "`===6` first guard" test to replicate in the draft/intel test files).

---

## Shared Patterns

### Local-import `.js` extension (server)
**Source:** every server file (e.g. `cache.ts:2`, `valveApi.ts:1`, `index.ts:4-8`).
**Apply to:** `queues.ts`, all `cache.ts`/`logger.ts`/service edits — `import { x } from './y.js'` (NodeNext ESM). Forgetting `.js` breaks the build.

### `cached()` is the ONLY upstream path
**Source:** CLAUDE.md + all three service files.
**Apply to:** the queue/retry MUST live inside `cached()` (cache.ts) so every upstream call is covered without touching call sites. Never add `fetch` outside a `fetchXxx()` that feeds `cached()`.

### Status-only logging (no secrets)
**Source:** `stratzApi.ts:45-46` (`log status only, never forward Stratz response body`), `valveApi.ts:8` (`never log the full URL — contains API key`), `cache.ts:21` (`never log the full Redis URL`).
**Apply to:** the new `logThrottle()` and all 429 handling — emit `upstream`/`status`/`attempt`/`delayMs` only. RESEARCH §Security line 463.

### Route-level 503 on upstream failure (D-03 fallback surfaces here)
**Source:** `live.ts:29-34` — `try { await getLiveLeagueGames() } catch { return c.json({ error:'upstream_unavailable' }, 503) }`.
**Apply to:** when `cached()` rethrows after stale-miss, routes already return 503 via this exact pattern. The stale-success path returns 200 transparently (no route change needed).

### Pure-helper + unit-test split for polling cadence
**Source:** `computeWinProbInterval`/`computeDraftInterval`/`computeIntelInterval` — each a pure exported fn with `game_state===6` as the first/covered guard, tested without React.
**Apply to:** all D-11 polling-stop tests follow this precedent (`useWinProbability.test.ts` is the template).

### TanStack Query v5 fetch idiom
**Source:** all 6 hooks — `const res = await fetch(url); if (!res.ok) throw new Error(`BFF error: ${res.status}`); return res.json()`.
**Apply to:** the `API_BASE` refactor preserves this idiom verbatim, only the URL prefix changes.

---

## No Analog Found

Files with no close in-repo match (planner uses RESEARCH.md §Deploy Configs, lines 341-403):

| File | Role | Reason |
|------|------|--------|
| `railway.json` | config | No deploy config exists yet. Use RESEARCH lines 344-360 (`builder: NIXPACKS`, `healthcheckPath: /api/health` — that route exists at `index.ts:14`). NOTE A5: production start must drop `--env-file=.env` (server/package.json:9) since Railway injects env via dashboard. |
| `vercel.json` | config | No SPA rewrite config exists. Use RESEARCH lines 366-375 (SPA rewrite to `/index.html`). A4: lives in `client/` with Vercel Root Directory = `client/`. |
| `DEPLOY.md` | docs | No deploy doc exists. New prose per RESEARCH §Deploy Configs + D-10 (Railway/Vercel/Upstash steps). |
| `.env.production.example` | config | Partial analog: repo-root `.env.example` (PORT, UPSTASH_*, VALVE_API_KEY) is the base to extend per RESEARCH lines 391-403 — add `STRATZ_TOKEN`, `CORS_ORIGIN`, `NODE_ENV`, and frontend `VITE_API_URL`. NOTE: current `.env.example` is MISSING `STRATZ_TOKEN` even though `env.ts:8` now requires it — fix in both. |

---

## Metadata

**Analog search scope:** `server/src/**`, `client/src/**`, repo-root config (`.env.example`, `vite.config.ts`).
**Files scanned:** cache.ts, cache.test.ts, logger.ts, index.ts, env.ts, valveApi.ts, openDotaApi.ts, stratzApi.ts, live.ts, useLiveGames.ts, useMatchDetail.ts, useWinProbability.ts(+test), useDraftDetail.ts, useMatchIntel.ts, App.tsx, MatchPage.tsx, MatchBentoGrid.tsx, ErrorBanner.tsx, RoshanBlock.test.tsx, index.css, client+server package.json, vite.config.ts, .env.example.
**Pattern extraction date:** 2026-06-14
