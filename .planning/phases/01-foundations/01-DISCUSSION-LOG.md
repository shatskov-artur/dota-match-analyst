# Phase 1: Foundations - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 01-foundations
**Areas discussed:** Repo Layout, heroMapper

---

## Repo Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Flat dirs (client/ + server/ + shared/) | Path aliases for shared types, no workspace tooling | ✓ |
| npm workspaces monorepo | packages/ with proper local package linking | |

**User's choice:** Flat dirs

**Follow-up: Root dev script vs separate terminals**

| Option | Description | Selected |
|--------|-------------|----------|
| Root dev script with concurrently | One `npm run dev` at root starts both | ✓ |
| Separate terminals | cd client + cd server separately | |

**User's choice:** Root dev script

**Notes:** User deferred to best practices judgment; confirmed flat dirs as the pragmatic choice for a small single-developer tool where workspace tooling adds friction without benefit.

---

## heroMapper

| Option | Description | Selected |
|--------|-------------|----------|
| Static bundled JSON | heroes.json in shared/, no runtime network call | ✓ |
| Fetched from OpenDota /heroes | Live data, cached in Redis, adds Phase 1 OpenDota dependency | |

**User's choice:** Static bundled JSON

**Follow-up: How to seed heroes.json**

| Option | Description | Selected |
|--------|-------------|----------|
| One-time fetch script | scripts/seed-heroes.ts, run once, commit JSON | ✓ |
| Hand-authored JSON | Manual entry for 130+ heroes | |

**User's choice:** One-time fetch script

**Notes:** User confirmed static is better. Script fetches from OpenDota /heroes, writes shared/heroes.json, committed to repo. Not run at runtime.

---

## Claude's Discretion

- Local dev Redis (Upstash dev instance vs Docker Compose) — deferred to planner
- tsconfig path alias naming convention
- ESLint/Prettier configuration details
- Test file co-location strategy

## Deferred Ideas

None surfaced during discussion.
