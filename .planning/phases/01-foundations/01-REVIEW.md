---
phase: 01-foundations
reviewed: 2026-04-23T00:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - package.json
  - shared/package.json
  - shared/tsconfig.json
  - shared/index.ts
  - shared/heroMapper.ts
  - shared/buildingDecoder.ts
  - shared/hiddenProfile.ts
  - shared/heroes.json
  - scripts/seed-heroes.ts
  - server/package.json
  - server/tsconfig.json
  - server/src/index.ts
  - server/src/env.ts
  - server/src/cache.ts
  - server/src/env.test.ts
  - server/src/cache.test.ts
  - server/src/schemas/valve.ts
  - server/src/services/valveApi.ts
  - server/src/routes/live.ts
  - client/package.json
  - client/tsconfig.json
  - client/vite.config.ts
  - client/src/main.tsx
  - client/src/App.tsx
  - client/src/index.css
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-23T00:00:00Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

This review covers the full Phase 1 file set, including all shared primitives, Valve zod schemas, the valveApi service, the live route, and the client scaffold. It supersedes the 2026-04-22 review. All three warnings from the previous review (WR-01 URL-parse-outside-try, WR-02 raw process.env.PORT, WR-03 zod in devDependencies) are confirmed fixed in the current code.

The new work — `buildingDecoder`, `heroMapper`, `hiddenProfile`, the Valve zod schema, and the `cached()` service layer — is high quality. Bitmask logic is correct, `.passthrough()` is consistently applied, and graceful degradation is implemented throughout. One critical bug was found: the Vite dev proxy strips the `/api` prefix but the backend mounts live routes under `/api/live`, causing the live data endpoint to 404 in development. Three warnings and three informational items complete the findings.

---

## Critical Issues

### CR-01: Vite proxy rewrite strips `/api` prefix — live route returns 404 in development

**File:** `client/vite.config.ts:18` and `server/src/index.ts:15`

**Issue:** The Vite dev proxy intercepts all `/api/*` requests and rewrites them by stripping the `/api` prefix before forwarding to `http://localhost:3001`:

```typescript
rewrite: (p) => p.replace(/^\/api/, ''),
```

A client request to `/api/live/games` arrives at the backend as `/live/games`. The backend registers the live route as `app.route('/api/live', liveRoutes)`, so it handles `/api/live/games` — not `/live/games`. The result is a 404 for the only data route currently defined.

The health endpoint works because the backend registers `app.get('/health', ...)` (no `/api` prefix), so `/api/health` → `/health` via rewrite is consistent. But the live route is broken in dev.

**Fix (preferred):** Remove the `rewrite` so the full path is forwarded unchanged, and the backend's `/api/live` mount is hit correctly:

```typescript
// client/vite.config.ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true,
      // rewrite removed — backend already uses /api prefix
    },
  },
},
```

This also requires moving the health endpoint to `/api/health` on the backend to stay consistent:

```typescript
// server/src/index.ts
app.get('/api/health', (c) => c.json({ status: 'ok', ts: Date.now() }))
```

**Alternative:** Keep the rewrite and strip `/api` from all backend routes (`app.route('/live', liveRoutes)`, `app.get('/health', ...)`). This is less preferred because it makes the backend's standalone URL structure less intuitive.

---

## Warnings

### WR-01: `buildingDecoder` returns a direct reference to a shared mutable constant — callers can corrupt the module

**File:** `shared/buildingDecoder.ts:23-30` and `75`

**Issue:** `ALL_ALIVE_LANE` is a single object instance reused as the `.top`, `.mid`, and `.bot` reference in `ALL_ALIVE_TEAM`. `ALL_ALIVE_TEAM` itself is returned directly — not cloned — when `towerState === undefined`:

```typescript
return { radiant: ALL_ALIVE_TEAM, dire: ALL_ALIVE_TEAM, unavailable: true }
```

Both `radiant` and `dire` alias the same `ALL_ALIVE_TEAM` object. Each lane in that object aliases the same `ALL_ALIVE_LANE` object. If any downstream consumer mutates the result (e.g. `state.radiant.top.tier1 = false` for display diffing), the mutation propagates back into the module-level constant. Every subsequent call with `towerState === undefined` returns the mutated values. This is a silent data corruption path — it does not throw and produces no observable error at the mutation site.

**Fix:** Return shallow clones of each lane and team in the unavailable branch:

```typescript
function cloneTeam(t: TeamBuildings): TeamBuildings {
  return {
    top: { ...t.top },
    mid: { ...t.mid },
    bot: { ...t.bot },
    ancientTop: t.ancientTop,
    ancientBottom: t.ancientBottom,
  }
}

// In buildingDecoder():
if (towerState === undefined) {
  return {
    radiant: cloneTeam(ALL_ALIVE_TEAM),
    dire: cloneTeam(ALL_ALIVE_TEAM),
    unavailable: true,
  }
}
```

### WR-02: Redis `catch` block logs the raw error object — may expose the embedded token in error messages

**File:** `server/src/cache.ts:25`

**Issue:** The token-embedded Redis URL (`rediss://:TOKEN@host:port`) is constructed at line 12 and passed to `new Redis(redisUrl, ...)` at line 13. If the `Redis` constructor throws (malformed URL, ioredis version incompatibility, etc.), some ioredis error messages include the connection string in their text. Line 25 logs the raw `err` object:

```typescript
console.error('[cache] Failed to initialize Redis client — caching disabled:', err)
```

Logging the raw error object in Node.js serialises the full error including `.message`, `.stack`, and any enumerable properties — potentially including the connection URL with the embedded `UPSTASH_REDIS_TOKEN`.

The `redis.on('error')` handler on line 22 already correctly logs only `err.message`. The catch block should follow the same pattern.

**Fix:**

```typescript
} catch (err) {
  console.error(
    '[cache] Failed to initialize Redis client — caching disabled:',
    err instanceof Error ? err.message : String(err),
  )
  redis = null
}
```

### WR-03: `PlayerSchema` requires `account_id` and `hero_id` — both can be absent during draft

**File:** `server/src/schemas/valve.ts:6-18`

**Issue:** The schema comment on line 6 states "ALL nested fields are `.optional()` — they are absent during lobby/pre-game states." However, `account_id` and `hero_id` are declared as required `z.number()` fields without `.optional()`. The Valve API can return player entries with absent or zero `hero_id` during the draft phase before heroes are locked. When this happens, `LiveLeagueGamesSchema.parse(raw)` throws a `ZodError`, and the entire `/api/live/games` response fails — the route returns an unhandled exception for any match currently in draft.

**Fix:**

```typescript
const PlayerSchema = z
  .object({
    account_id: z.number().optional(), // absent during draft pre-lock
    hero_id: z.number().optional(),    // absent during draft pre-lock
    name: z.string().optional(),
    // ... rest unchanged
  })
  .passthrough()
```

Callers consuming `account_id` should already use the `hiddenProfile()` guard; make it handle `undefined` explicitly, or guard before calling:

```typescript
if (player.account_id !== undefined && hiddenProfile(player.account_id)) { ... }
```

---

## Info

### IN-01: `scripts/seed-heroes.ts` casts the OpenDota response without runtime validation

**File:** `scripts/seed-heroes.ts:40`

**Issue:** The response body is cast with `as OdotaHero[]` without any runtime shape check:

```typescript
const heroes: OdotaHero[] = await res.json() as OdotaHero[]
```

If OpenDota returns an unexpected structure (rate-limit error object, HTML page, etc.), the `for...of` loop on line 43 silently produces malformed entries or throws an opaque runtime error. A failed or partial run could write a corrupted `heroes.json`, causing `heroMapper` to return `null` for all heroes until the file is manually repaired.

**Fix:** Add a minimal shape guard before iterating:

```typescript
const raw: unknown = await res.json()
if (!Array.isArray(raw)) {
  throw new Error(`Unexpected OpenDota response shape: ${JSON.stringify(raw).slice(0, 200)}`)
}
const heroes = raw as OdotaHero[]
```

### IN-02: `App.tsx` health-check uses implicit `any` from `.json()` — type is not enforced

**File:** `client/src/App.tsx:8-9`

**Issue:** `r.json()` returns `Promise<any>`. The `.then(d => d.status === 'ok' ...)` chain relies on `any` propagation — TypeScript does not verify that the shape is correct. This is a placeholder component scheduled for replacement, but the pattern should not carry forward into production components.

**Fix:**

```typescript
type HealthResponse = { status: string }
fetch('/api/health')
  .then((r) => r.json() as Promise<HealthResponse>)
  .then((d) => setHealth(d.status === 'ok' ? 'BFF OK' : 'unexpected'))
  .catch(() => setHealth('BFF unreachable'))
```

### IN-03: `server/src/index.ts` startup log uses `console.log` — `pino` is already a declared dependency

**File:** `server/src/index.ts:20`

**Issue:** `pino` is listed in `server/package.json` dependencies for structured logging, but the startup message uses `console.log`. All cache errors use `console.error`. In production (Railway) these produce unstructured plain-text lines. Structured JSON logs from pino are searchable and parseable by log aggregation tooling.

**Fix:** Wire a pino logger at the server entry point and thread it through:

```typescript
import pino from 'pino'
const logger = pino()

serve({ fetch: app.fetch, port }, () => {
  logger.info({ port }, 'BFF listening')
})
```

The `cache.ts` `console.error` calls can be replaced with a shared logger instance in a follow-up. This is low-priority until Phase 7 (Harden & Deploy).

---

_Reviewed: 2026-04-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
