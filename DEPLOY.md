# Deploy Guide — Dota 2 Match Analyst

Split-origin production deploy: the **React + Vite SPA** runs on **Vercel** and calls the
**Node 24 + Hono BFF** on **Railway**, which caches upstream API responses in **Upstash Redis**.

```
Browser ──HTTPS──▶ Vercel SPA (client/)          static index.html + assets
   │
   └──fetch(`${VITE_API_URL}/api/...`)──▶ Railway BFF (server/)  ──▶ Upstash Redis
                                                       │
                                                       └──▶ Valve / OpenDota / Stratz
```

**Secrets rule:** nothing in this repo carries real credentials. Every secret is set **only**
in the provider dashboards (Railway / Vercel). The committed `*.example` files document *what*
to set and *where*. See `.env.production.example` for the full variable list.

Follow the steps **in order** — the cross-wiring (step 4) depends on both hosts existing first.

---

## 1. Upstash — serverless Redis cache

1. Sign in at <https://console.upstash.com> and **Create Database** (Redis).
   Pick a region close to your Railway region to minimise latency.
2. Open the database → **Redis Connect** → **ioredis** tab.
3. Copy the connection **URL** (`rediss://:<token>@<host>:<port>`) and the **token**.
   You will paste these into Railway in the next step as `UPSTASH_REDIS_URL` and
   `UPSTASH_REDIS_TOKEN`.

> The BFF uses the ioredis (Redis-protocol) endpoint, **not** the REST URL.

---

## 2. Railway — deploy the BFF (`server/`)

1. Sign in at <https://railway.app> → **New Project** → **Deploy from GitHub repo** →
   select this repository.
2. Open the service → **Settings** → **Root Directory** and set it to **`server/`**.
   (The monorepo has sibling `client/`, `server/`, `shared/` dirs — Railway must build only `server/`.)
3. Confirm the builder. `railway.json` at the repo root pins **`"builder": "NIXPACKS"`**
   (Nixpacks must be explicit — Railpack is the 2026 default). It also sets:
   - `buildCommand`: `npm run build`
   - `startCommand`: `npm run start` → `node dist/index.js` (**no** `--env-file`; Railway injects env via the dashboard)
   - `healthcheckPath`: `/api/health`
4. **Settings → Variables** — add these (values from steps 1 and the API providers):

   | Variable              | Value / source                                                        |
   | --------------------- | --------------------------------------------------------------------- |
   | `NODE_ENV`            | `production`                                                          |
   | `UPSTASH_REDIS_URL`   | Upstash → Redis Connect → ioredis (`rediss://:<token>@<host>:<port>`)  |
   | `UPSTASH_REDIS_TOKEN` | Upstash → Redis Connect                                              |
   | `VALVE_API_KEY`       | <https://steamcommunity.com/dev/apikey>                              |
   | `STRATZ_TOKEN`        | <https://stratz.com/api>                                             |
   | `CORS_ORIGIN`         | *(set in step 4, once the Vercel URL exists)*                        |

   > **Do NOT set `PORT`.** Railway injects it automatically and the BFF reads `process.env.PORT`.
5. Deploy. Wait for the **healthcheck on `/api/health`** to pass (Railway shows the service
   **healthy**). Copy the service's public URL, e.g. `https://your-bff.up.railway.app`
   (**no trailing slash, no `/api`**) — you need it for Vercel next.

---

## 3. Vercel — deploy the SPA (`client/`)

1. Sign in at <https://vercel.com> → **Add New… → Project** → import this repository.
2. **Settings → General → Root Directory** → set to **`client/`**.
   `client/vercel.json` provides the build command, `dist` output dir, and the SPA rewrite
   (`/(.*) → /index.html`) so React Router v7 deep links survive a hard refresh.
3. **Settings → Environment Variables** → add:

   | Variable       | Value                                                             |
   | -------------- | ---------------------------------------------------------------- |
   | `VITE_API_URL` | The Railway BFF URL from step 2 (no trailing slash, no `/api`)    |

   > **CRITICAL:** Vite inlines `VITE_*` at **build time**. `VITE_API_URL` **must be set
   > BEFORE** the Vercel build runs. If you add it after a build, redeploy so it is inlined.
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
   — confirms the SPA rewrite in `client/vercel.json`.
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
| CORS error in console                     | `CORS_ORIGIN` on Railway doesn't **exactly** match the Vercel origin (trailing slash / http vs https). |
| Requests go to Vercel, not Railway        | `VITE_API_URL` was unset/blank at build time — set it in Vercel and **redeploy** (build-time inline).   |
| `404` on hard-refresh of `/match/:id`     | `client/vercel.json` rewrite missing or Root Directory not `client/`.                                   |
| Railway healthcheck never passes          | Root Directory not `server/`, or a required env var missing (env schema fails fast at boot).            |
| `PORT` errors / app not reachable         | You set `PORT` manually — remove it; Railway injects it.                                                |

### Preview deploys (optional)

Vercel gives each PR a `*.vercel.app` **preview** URL. Since the BFF pins one exact
`CORS_ORIGIN`, preview origins hitting the **production** BFF will be blocked. If you want
previews to reach prod, replace the static origin with a CORS **origin function** on the BFF
that allows the production origin plus a `*.vercel.app` suffix match — otherwise deploy a
separate preview BFF. The default single-origin config is the safest and is what production uses.
