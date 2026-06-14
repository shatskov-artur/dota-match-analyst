# Phase 11: Harden & Deploy - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the app survive a full day of real tournament viewing on a public URL. Three hardening tracks + a deployment track:
1. **Error isolation** — one failing widget never blanks the match screen.
2. **Upstream rate-limit protection** — per-provider queues + 429 exponential backoff so free-tier quotas (Valve 100k/day, OpenDota 50k/month, Stratz 500/hr) are never exhausted.
3. **Polling-stop** — finished matches (`game_state === 6`) stop draining quota (mostly wired; verify + test).
4. **Deploy** — frontend → Vercel, BFF → Railway, Redis → Upstash, with a shareable URL that works without local setup.

No new product features. No auth (locked: personal + small-group tool, v1).

</domain>

<decisions>
## Implementation Decisions

### Rate-limit queue + 429 backoff
- **D-01:** Use **p-queue + p-retry** (sindresorhus). p-queue gives per-upstream concurrency/interval control; p-retry handles exponential backoff on 429. Small, proven, minimal code over Bottleneck or a hand-rolled queue.
- **D-02:** **One queue per upstream** — separate p-queue instances for Valve, OpenDota, Stratz. Each tuned to its own quota envelope. The `cached()` wrapper (CLAUDE.md: only path to upstream) is where queue + retry are applied, so every upstream call is covered without touching call sites.
- **D-03:** On 429, retry with exponential backoff (respect `Retry-After` header when present). After retries are exhausted: **return stale cache if present in Redis, otherwise 503** with a clear message. Never block indefinitely.
- **D-04:** Every throttle/backoff event emits a structured pino log (criterion 2) — `logger.ts` (pino) already exists; extend it with throttle-event fields (upstream, attempt, delay, status).

### Error boundaries (frontend)
- **D-05:** Granularity = **per bento-card**. Each Match panel/card (heroes, items, cooldowns, history, roshan+buildings, map, score, draft) gets its own error boundary so a single widget crash (e.g. IntelTooltip) isolates to that card.
- **D-06:** Fallback = **mini "couldn't load" card** in Neon Bento style (surface tile, icon + short message + Retry button). Retry re-mounts the boundary's children. Not silent-hide — the user sees what failed and can recover.
- **D-07:** Also wrap each route (Home, Match) in a top-level boundary as a backstop, but the per-card boundaries are the primary isolation layer.

### Deploy (Vercel + Railway + Upstash)
- **D-08:** BFF on Railway via **Nixpacks** (auto-detect Node, npm build → npm start). Minimal config: `railway.json` + a production `start` script. No Dockerfile.
- **D-09:** Split-origin: frontend (Vercel) calls BFF (Railway) via **`VITE_API_URL` env + CORS** on the BFF (allow the Vercel origin). Client reads the BFF base URL from `VITE_API_URL`; no Vercel rewrite proxy.
- **D-10:** Document deploy with **`.env.production.example` + `DEPLOY.md`** — step-by-step for Railway (BFF + env vars), Vercel (frontend + VITE_API_URL), and Upstash (Redis connect string). Owner deploys manually following the guide.

### Polling-stop verification
- **D-11:** **Verify + add a test.** `useMatchDetail` already stops at `game_state === 6` (line 39). Confirm the live-list and draft pollers behave correctly too (live list polls 30s by design; draft has its own cadence). Add a unit test asserting `refetchInterval === false` when `game_state === 6` if one doesn't exist.

### Execution order
- **D-12:** **Hardening first, then deploy.** Build error boundaries + rate-limit queue + polling-stop verification (code), then create deploy configs. Deploy a hardened app, not a fragile one. The planner should wave it accordingly (hardening waves → deploy wave).

### Claude's Discretion
- Exact p-queue concurrency/interval numbers per upstream (derive from documented quotas + caching TTLs).
- Exact pino log field names/shape for throttle events.
- Whether the error-boundary component is one reusable `<BentoErrorBoundary>` or a small set — implementation detail.
- `railway.json` / `vercel.json` exact field layout.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements
- `.planning/ROADMAP.md` §"Phase 11: Harden & Deploy" — the 4 success criteria are the acceptance bar.
- `.planning/PROJECT.md` — locked constraints: free-tier API quotas (Valve 100k/day, OpenDota 50k/month, Stratz 500/hr), aggressive caching non-negotiable, no auth v1, Redis TTLs (live 30s, hero stats 6h, player stats 15min).

### Existing code to extend
- `server/src/cache.ts` — `cached()` wrapper, the single upstream path; rate-limit queue + retry attach here.
- `server/src/logger.ts` — existing pino logger; extend for structured throttle-event logs.
- `server/src/services/valveApi.ts`, `openDotaApi.ts`, `stratzApi.ts` — the three upstream services that each need their own queue.
- `client/src/hooks/useMatchDetail.ts` — polling-stop at `game_state === 6` already wired (verify reference).
- `.env.example` — base env template to extend into `.env.production.example`.

### Project conventions
- `CLAUDE.md` — "cached() is the ONLY path to upstream; never call fetch directly" — the queue must live inside/around `cached()` to honor this.

No external ADRs/specs beyond the above — requirements fully captured in decisions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `cached()` (server/src/cache.ts): single chokepoint for all upstream calls — ideal place to inject per-upstream queue + p-retry without touching call sites.
- `logger.ts` (pino): structured logging already in place — extend, don't add a new logger.
- Neon Bento `.bento-card` utility (client/src/index.css) + card components: the error-boundary fallback should reuse the card surface styling for visual consistency.
- `useMatchDetail` polling-stop logic: pattern to mirror/verify across other pollers.

### Established Patterns
- Per-data-type Redis TTLs already defined (TTL constants) — the stale-cache-on-429 fallback (D-03) reads whatever is still in Redis.
- React Query (`refetchInterval` callbacks) drives all polling — polling-stop is a query-config concern, not a new mechanism.

### Integration Points
- Queue + retry wrap inside `cached()` → every upstream service benefits automatically.
- Error boundaries wrap Match/Home card components in MatchPage.tsx and the Home grid.
- Deploy configs are new top-level files (railway.json, vercel.json, .env.production.example, DEPLOY.md) — no code changes for deploy track itself.

</code_context>

<specifics>
## Specific Ideas

- Fallback card must match Neon Bento (violet/gold OLED) — reuse `.bento-card` surface so a failed widget still looks intentional, not broken.
- Respect `Retry-After` on 429 when the upstream provides it, rather than always using the computed backoff.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Auth, public-matchmaking matches, and WebSocket are permanently out of v1 scope per PROJECT.md, not deferred Phase-11 items.)

</deferred>

---

*Phase: 11-harden-deploy*
*Context gathered: 2026-06-14*
