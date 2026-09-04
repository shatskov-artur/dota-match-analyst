# Deploy Guide — Dota 2 Match Analyst

Split-origin production deploy: the **React + Vite SPA** runs on **Vercel** and calls the
**Node 24 + Hono BFF** on **Railway**, which caches upstream API responses in **Upstash Redis**.

```
Browser ──HTTPS──▶ Vercel SPA (client/)          static index.html + assets
   │
   └──fetch(`${VITE_API_URL}/api/...`)──▶ Railway BFF (server/)  ──▶ Upstash Redis
              + Authorization: Bearer            │       │
                                                 │       └──▶ Postgres (v2.0 archive)
                                                 └──▶ Valve / OpenDota / Stratz
```

**v2.0 note.** The archive (tournaments, brackets, schedule, per-minute timelines, time
travel) needs the Postgres service in **step 2b**. Skip it and the BFF still serves every
`/api/live/*` route, but every archive route answers empty — and `/api/health` stays green
while it happens. That is why the health body carries an `archive` field; check it after
the first deploy.

**Secrets rule:** nothing in this repo carries real credentials. Every secret is set **only**
in the provider dashboards (Railway / Vercel). The committed `*.example` files document *what*
to set and *where*. See `.env.production.example` for the full variable list.

Follow the steps **in order** — the cross-wiring (step 4) depends on both hosts existing first.

---

## 1. Upstash — serverless Redis cache

1. Sign in at <https://console.upstash.com> and **Create Database** (Redis).
   Pick a region close to your Railway region to minimise latency.
2. Open the database and copy its **endpoint URL** (e.g. `https://your-instance.upstash.io`)
   and its **token**. You will paste these into Railway in the next step as
   `UPSTASH_REDIS_URL` and `UPSTASH_REDIS_TOKEN`.

> `cache.ts` reads only the **host** out of `UPSTASH_REDIS_URL` and rebuilds the
> connection itself as `rediss://:<UPSTASH_REDIS_TOKEN>@<host>`. So the scheme does
> not matter, and you must **not** append a port — Upstash's TLS endpoint answers on
> ioredis's default `6379`. Pasting a `:6380` URL makes the BFF fail to reach Redis.

---

## 2. Railway — deploy the BFF (`server/`)

1. Sign in at <https://railway.app> → **New Project** → **Deploy from GitHub repo** →
   select this repository. Railway will ask you to install its **GitHub App** first; grant it
   access to **this repository only**.
2. Railway creates a **service** (a card on the project canvas). Click that card, then open its
   **Settings** tab — *service* settings, not project settings.

   **Leave Root Directory empty (the repo root).** Do *not* set it to `server`.
   `server/tsconfig.json` compiles `../shared/*.ts` alongside `server/src`, so the build needs
   both directories. Rooting the build at `server/` copies only that directory into the image
   and `tsc` dies with `TS2307: Cannot find module '../../../shared/hiddenProfile.js'`.
   The root `railway.json` targets `server/` explicitly instead.

3. Confirm the builder. `railway.json` (repo root) pins **`"builder": "NIXPACKS"`**
   (Nixpacks must be explicit — Railpack is the 2026 default). It also sets:
   - `buildCommand`: `npm run build:server`
     → `npm install --include=dev --prefix server && npm run build --prefix server`
     (`--include=dev` is required: `NODE_ENV=production` makes npm skip `devDependencies`,
     and `tsc` lives there — without it the build dies with `tsc: not found`, exit 127)
   - `startCommand`: `npm run migrate:deploy && npm run start:server`
     (**no** `--env-file`; Railway injects env via the dashboard)
     (`tsconfig.json` sets `rootDir: ".."` so `tsc` can pull in `shared/`; it therefore mirrors
     the source tree and the entrypoint lands under `dist/server/src/`, **not** `dist/`)
     (`migrate:deploy` applies `server/drizzle/*.sql` before the listener binds, and is a
     clean no-op when `DATABASE_URL` is unset. Without it a schema change deploys against an
     old database and the ingest job fails on every tick — silently, because it catches and
     logs while `/api/health` keeps answering `ok`)
   - `healthcheckPath`: `/api/health`
4. **Settings → Variables** — add these (values from steps 1 and the API providers):

   | Variable              | Required | Value / source                                                        |
   | --------------------- | -------- | --------------------------------------------------------------------- |
   | `NODE_ENV`            | yes      | `production`                                                          |
   | `UPSTASH_REDIS_URL`   | yes¹     | Upstash → database endpoint, host only, **no port** (e.g. `https://your-instance.upstash.io`) |
   | `UPSTASH_REDIS_TOKEN` | yes¹     | Upstash → database token                                             |
   | `VALVE_API_KEY`       | yes      | <https://steamcommunity.com/dev/apikey>                              |
   | `STRATZ_TOKEN`        | yes      | <https://stratz.com/api>                                             |
   | `CORS_ORIGIN`         | yes      | *(set in step 4, once the Vercel URL exists)*                        |
   | `API_TOKEN`           | yes      | A long random string — `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`. The SPA must send the same value as `VITE_API_TOKEN`. |
   | `DATABASE_URL`        | archive  | `${{Postgres.DATABASE_URL}}` after step 2b                           |
   | `TRACKED_LEAGUE_IDS`  | no       | Explicit, exclusive league list. Resolve ids with `npm run find:league` — never guess one |
   | `ARCHIVE_LEAGUE_TIERS`| no       | Defaults to `premium,professional`. Adding `amateur` is what fills a disk at ~1 GB/day |
   | `INGEST_DISABLED`     | no       | `1` to serve reads without recording anything                         |

   ¹ Or `REDIS_URL` instead of the Upstash pair, if you run your own Redis.

   > **`NODE_ENV=production` now makes `CORS_ORIGIN` and `API_TOKEN` mandatory** — the server
   > refuses to boot without them, by design. Both were previously fail-open: an unset
   > `CORS_ORIGIN` fell back to `http://localhost:5173`, and with no token every route was
   > anonymous, so anyone could spend the Valve and Stratz quota these keys pay for.
   > A single `/api/live/intel/:id` call costs up to ten OpenDota and ten Stratz requests
   > against a Stratz budget of 500 an hour.

   > **Do NOT set `PORT`.** Railway injects it automatically and the BFF reads `process.env.PORT`.
5. Deploy. Wait for the **healthcheck on `/api/health`** to pass (Railway shows the service
   **healthy**). Copy the service's public URL, e.g. `https://your-bff.up.railway.app`
   (**no trailing slash, no `/api`**) — you need it for Vercel next.

   Check the body, not just the status:

   ```bash
   curl https://your-bff.up.railway.app/api/health
   # {"status":"ok","archive":"reachable","ts":...}
   ```

   `archive` is `not_configured` without `DATABASE_URL`, and `unreachable` when the database
   is set but not answering. `status: ok` deliberately does not depend on it — the live routes
   work either way — so this field is the only thing that tells you the archive is alive.

---

## 2b. Railway — Postgres for the v2.0 archive

Skip this only if you want the live-only app.

1. In the same Railway project: **New → Database → Add PostgreSQL**.
2. Back on the BFF service → **Variables** → add `DATABASE_URL` with the value
   `${{Postgres.DATABASE_URL}}` (Railway's reference syntax — it resolves at deploy time,
   so the credential is never copied by hand).
3. Redeploy. `migrate:deploy` in the start command creates the schema on first boot; the
   log line is `migrations applied from …`.
4. Confirm with `curl …/api/health` → `"archive":"reachable"`.

> **Encoding.** Railway's Postgres is UTF8, which is what the archive requires — Cyrillic
> player names are rejected outright by a WIN1250 database. This only bites on a local
> Windows `initdb`, not here.

---

## 3. Vercel — deploy the SPA (`client/`)

1. Sign in at <https://vercel.com> → **Add New… → Project** → import this repository.
2. **Leave Root Directory as the repo root.** Do *not* set it to `client`.

   Same constraint as Railway: `client/` imports `shared/` both via the `@shared` alias and
   via `../../../shared/*.json`, so rooting the build at `client/` omits `shared/` and `tsc`
   fails with `TS2307: Cannot find module '@shared/buildingDecoder'`.

   The root `vercel.json` targets `client/` explicitly instead — it sets `buildCommand`
   (`npm run build:client`), `outputDirectory` (`client/dist`), and the SPA rewrite
   (`/(.*) → /index.html`) so React Router v7 deep links survive a hard refresh.
3. **Settings → Environment Variables** → add:

   | Variable         | Value                                                             |
   | ---------------- | ---------------------------------------------------------------- |
   | `VITE_API_URL`   | The Railway BFF URL from step 2 (no trailing slash, no `/api`)    |
   | `VITE_API_TOKEN` | **Exactly** the `API_TOKEN` you set on Railway                    |

   > **CRITICAL:** Vite inlines `VITE_*` at **build time**. Both **must be set BEFORE** the
   > Vercel build runs. If you add them after a build, redeploy so they are inlined.
   > A mismatched or missing `VITE_API_TOKEN` makes every request answer `401` and the app
   > shows its error states everywhere — that is the first thing to check if a fresh deploy
   > looks empty.

   > **`VITE_API_TOKEN` is not a secret from the user.** Vite bakes it into the JS bundle,
   > so anyone who opens the network tab can read it. It stops crawlers, scanners and
   > accidental discovery, and the BFF's rate limiter caps what any one client can spend.
   > Real per-user authentication is a different feature and this is not a substitute for it.

4b. **`vercel.json` ships a Content-Security-Policy.** Its `connect-src` allows
   `https://*.up.railway.app`, which covers Railway's default domain. **If you put the BFF
   on a custom domain, add it to `connect-src`** — otherwise the browser blocks every API
   call and the console fills with CSP violations while the network tab shows nothing sent.
4. Deploy. Copy the Vercel **production** URL, e.g. `https://your-app.vercel.app`
   (**no trailing slash**).

---

## 4. Cross-wire CORS (Railway ← Vercel URL)

1. Back in **Railway → Settings → Variables**, set `CORS_ORIGIN` to the exact Vercel
   production URL from step 3 — **no trailing slash, no path**
   (`https://your-app.vercel.app`, **not** `.../`).
2. Redeploy the BFF so the new `CORS_ORIGIN` takes effect. The BFF scopes CORS to `/api/*`
   with `credentials: false` and this **exact** origin (no `*`), so a mismatched or
   trailing-slash value will be rejected in the browser.

---

## 5. Smoke test (the shareable URL)

1. Open the **Vercel production URL** in a fresh browser (no local setup): the **live matches
   list renders**.
2. Navigate into a match (`/match/:id`) and **hard-refresh** the page: it loads (**not a 404**)
   — confirms the SPA rewrite in the root `vercel.json`.
3. Open **DevTools → Console**: there is **no CORS error** on the Vercel → Railway `/api/*`
   requests.
4. *(Optional soak)* Leave it running during a real match day. Watch **Railway logs** for
   `upstream throttle` warn records (status-only, no url/key/token) and confirm there are no
   503 storms — the rate-limit queues + stale-cache fallback (Plan 11-01) should absorb bursts.

If all four pass, the deploy is live and shareable.

---

## Troubleshooting

| Symptom                                   | Likely cause / fix                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| CORS error in console                     | `CORS_ORIGIN` on Railway doesn't match the Vercel origin — scheme (`http` vs `https`) or host. A trailing slash is harmless: `env.ts` strips it. |
| Requests go to Vercel, not Railway        | `VITE_API_URL` was unset/blank at build time — set it in Vercel and **redeploy** (build-time inline).   |
| `404` on hard-refresh of `/match/:id`     | Root `vercel.json` rewrite missing, or Root Directory was set to `client` (must stay the repo root).    |
| `tsc` fails with `TS2307` on `shared/…`   | Root Directory was set to `server`/`client`. Both builds must run from the repo root so `shared/` resolves. |
| Railway healthcheck never passes          | A required env var is missing (the env schema fails fast at boot), or Root Directory was set to `server`. |
| `PORT` errors / app not reachable         | You set `PORT` manually — remove it; Railway injects it.                                                |

### Preview deploys (optional)

Vercel gives each PR a `*.vercel.app` **preview** URL. Since the BFF pins one exact
`CORS_ORIGIN`, preview origins hitting the **production** BFF will be blocked. If you want
previews to reach prod, replace the static origin with a CORS **origin function** on the BFF
that allows the production origin plus a `*.vercel.app` suffix match — otherwise deploy a
separate preview BFF. The default single-origin config is the safest and is what production uses.
