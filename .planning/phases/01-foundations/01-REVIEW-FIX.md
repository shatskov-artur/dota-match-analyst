---
phase: 01-foundations
fixed_at: 2026-04-22T23:53:48Z
review_path: .planning/phases/01-foundations/01-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-04-22T23:53:48Z
**Source review:** .planning/phases/01-foundations/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Vite proxy rewrite strips `/api` prefix — live route returns 404 in development

**Files modified:** `client/vite.config.ts`, `server/src/index.ts`
**Commit:** 490ae4f
**Applied fix:** Removed the `rewrite: (p) => p.replace(/^\/api/, '')` line from the Vite proxy config so the full path (including `/api`) is forwarded unchanged to the backend. Moved the backend health endpoint from `app.get('/health', ...)` to `app.get('/api/health', ...)` for consistency. The client's `App.tsx` already fetches `/api/health`, so no client change was needed.

### WR-01: `buildingDecoder` returns direct reference to shared mutable constant

**Files modified:** `shared/buildingDecoder.ts`
**Commit:** 15163b5
**Applied fix:** Added a `cloneTeam(t: TeamBuildings): TeamBuildings` helper function that shallow-copies each lane (`top`, `mid`, `bot`) using spread syntax. The unavailable branch of `buildingDecoder` now calls `cloneTeam(ALL_ALIVE_TEAM)` for both `radiant` and `dire` instead of returning direct references to the module-level constant.

### WR-02: Redis `catch` block logs raw error object — may expose embedded token

**Files modified:** `server/src/cache.ts`
**Commit:** acdb2ab
**Applied fix:** Changed `console.error(..., err)` in the catch block to `console.error(..., err instanceof Error ? err.message : String(err))`, matching the pattern already used in the `redis.on('error')` handler on line 22. This prevents the Redis connection URL (which contains the embedded `UPSTASH_REDIS_TOKEN`) from appearing in log output.

### WR-03: `PlayerSchema` requires `account_id` and `hero_id` — both can be absent during draft

**Files modified:** `server/src/schemas/valve.ts`
**Commit:** 7a7199e
**Applied fix:** Added `.optional()` to both `account_id` and `hero_id` fields in `PlayerSchema`. Both fields can be absent from Valve API player entries during the draft phase before heroes are locked. Without `.optional()` zod throws a `ZodError` for any in-progress draft match, causing the entire `/api/live/games` response to fail.

## Skipped Issues

None — all findings were fixed.

---

_Fixed: 2026-04-22T23:53:48Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
