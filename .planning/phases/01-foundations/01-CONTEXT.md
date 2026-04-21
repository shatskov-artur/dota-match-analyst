# Phase 1: Foundations - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up the typed client-BFF-cache pipeline so any match data request can flow end-to-end, before a single UI screen exists.

Deliverables: repo scaffolded with `client/` + `server/` + `shared/` directories, Hono BFF reachable from the Vite client, `cached()` decorator backed by Redis, and three shared primitives fully unit-tested — `heroMapper`, `buildingDecoder`, `hiddenProfile` guard.

No UI components are part of this phase.

</domain>

<decisions>
## Implementation Decisions

### Repo Layout
- **D-01:** Flat directory structure — `client/`, `server/`, `shared/` at repo root. Each has its own `package.json`. No npm workspaces.
- **D-02:** Shared zod schemas and TypeScript types live in `shared/`. Both `client` and `server` reference them via tsconfig `paths` aliases (e.g., `@shared/*` → `../shared/*`).
- **D-03:** Root `package.json` has a `dev` script using `concurrently` to start both client and server in one terminal. Individual `cd client && npm run dev` / `cd server && npm run dev` commands also work for separate terminals.

### heroMapper
- **D-04:** `heroMapper` is backed by a static `shared/heroes.json` file — no runtime network call. Maps `hero_id → { name, portrait }` where portrait URLs follow the Valve CDN pattern: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/{name}.png`.
- **D-05:** A one-time seed script (`scripts/seed-heroes.ts`) fetches hero data from OpenDota `/heroes`, writes `shared/heroes.json`, and is committed to the repo. The script is run once during Phase 1 setup — not at runtime or build time.
- **D-06:** `heroMapper(id: number)` returns `{ name: string, portrait: string } | null` for unknown IDs. Never throws.

### Cache / Redis
- **D-07 (Claude's discretion):** Local development may use Upstash (with a dev instance env var) or a Docker Compose local Redis — the planner should pick whichever requires less onboarding friction. The `cached()` decorator accepts a connection string so either works transparently.
- **D-08:** TTLs are set per data type as established in research: 30s live match data, 6h hero stats, 15min player stats.

### Shared Primitives — Contracts
- **D-09:** `buildingDecoder(bitmask: number | undefined): BuildingState` — handles `undefined`/absent `building_state` gracefully (returns all-alive placeholder or explicit `unavailable` flag rather than crashing).
- **D-10:** `hiddenProfile(account_id: number): boolean` — returns `true` when `account_id === 4294967295`; short-circuits all OpenDota calls upstream.
- **D-11:** All three primitives are pure functions in `shared/` and unit-tested with vitest. Edge cases to cover: absent `building_state`, hidden profile sentinel, unknown `hero_id`.

### Claude's Discretion
- Local dev Redis approach (Upstash dev instance vs Docker Compose local) — either works; planner decides based on onboarding simplicity.
- Exact tsconfig `paths` alias names (e.g., `@shared/` vs `~/shared/`) — standard `@shared/*` convention preferred.
- ESLint / Prettier configuration details — use standard defaults for the stack.
- Test file co-location (adjacent to source vs `__tests__/`) — planner decides.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack Validation
- `.planning/research/STACK.md` — Full stack rationale, exact versions, installation commands for `client/` and `server/`, and the Tailwind v4 CSS-first setup. Contains the prescriptive `package.json` scripts and `vite.config.ts`.
- `.planning/research/SUMMARY.md` — Architecture shape, top 5 pitfalls, and the `cached()` + zod pattern.

### Requirements & Roadmap
- `.planning/ROADMAP.md` §Phase 1 — Exact success criteria (4 criteria) that define when this phase is done.
- `.planning/REQUIREMENTS.md` — Not directly applicable to Phase 1 (infra phase), but provides context for what primitives must support in later phases.

### Project Constraints
- `CLAUDE.md` — Key patterns section: `cached()` decorator contract, `.passthrough()` rule, dynamic `refetchInterval`, Stratz optional pattern, hidden profile short-circuit. These constraints originate here and must be respected in Phase 1 scaffolding.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — project is a blank repo. No existing components, hooks, or utilities.

### Established Patterns
- None yet — Phase 1 establishes the patterns all subsequent phases will follow.

### Integration Points
- `client/` will import types from `shared/` via path aliases.
- `server/` will import zod schemas and type helpers from `shared/` via path aliases.
- BFF health endpoint (`GET /health`) is the first integration point — client must be able to reach it as a smoke test.

</code_context>

<specifics>
## Specific Ideas

- The STACK.md research file already provides working installation commands and a `vite.config.ts` snippet for Tailwind v4 — the planner should use these directly rather than re-deriving them.
- Portrait URL pattern from Valve CDN: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/{internal_name}.png` (e.g., `antimage.png` not `Anti-Mage.png`). The seed script should map to `internal_name` (OpenDota provides this as `name` field).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundations*
*Context gathered: 2026-04-22*
