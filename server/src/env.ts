import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.string().default('3001'),
  NODE_ENV: z.string().optional(),
  // Upstash pair is only required when REDIS_URL is absent — see the superRefine below.
  // A local `docker compose -f docker-compose.local.yml up` sets REDIS_URL instead.
  UPSTASH_REDIS_URL: z.string().min(1).optional(),
  UPSTASH_REDIS_TOKEN: z.string().min(1).optional(),
  // v2.0 — plain Redis connection string (redis://host:port or rediss://…).
  // Takes precedence over the UPSTASH_* pair in cache.ts.
  REDIS_URL: z.string().min(1).optional(),
  VALVE_API_KEY: z.string().min(1, 'VALVE_API_KEY is required. Get it from https://steamcommunity.com/dev/apikey'),
  STRATZ_TOKEN: z.string().min(1, 'STRATZ_TOKEN is required. Get it from https://stratz.com/api'),  // D-01
  // Exact Vercel URL in prod; optional so local boot works.
  // Browsers never send a trailing slash in the Origin header, and Hono compares the
  // configured origin verbatim — so a dashboard value like "https://app.vercel.app/"
  // silently blocks every request. Strip it here rather than rely on the operator.
  CORS_ORIGIN: z.string().trim().transform((s) => s.replace(/\/+$/, '')).optional(),

  // Shared secret guarding /api/* (everything except /api/health).
  //
  // Unset means "no check", which is what keeps `npm run dev` and the local-only v2.0
  // archive working exactly as before — but it is REQUIRED once NODE_ENV=production,
  // see the superRefine below. The reason is that this BFF spends someone's Valve and
  // Stratz quota on every request: /api/live/intel/:id costs up to ten OpenDota calls
  // and ten Stratz calls, against a Stratz budget of 500 an hour. Anonymous and public
  // means one crawler drains the day's quota and the app goes blind for everybody.
  //
  // Be honest about what this is: a browser SPA has to carry the token in its bundle,
  // so it is not a secret against someone reading the network tab. It stops crawlers,
  // scanners and accidental discovery, and combined with the rate limiter it bounds
  // what any single client can spend. Real per-user auth is a different project.
  API_TOKEN: z.string().min(16, 'API_TOKEN must be at least 16 characters').optional(),

  // ─── v2.0 tournament archive ──────────────────────────────────────────────
  // Postgres connection string. Optional on purpose: the BFF must still boot and
  // serve /api/live/* when the archive is down, exactly like it does when Redis is
  // unreachable (cache.ts degrades to `redis = null`). db/index.ts logs loudly and
  // the ingest job refuses to start rather than silently dropping tournament data.
  DATABASE_URL: z.string().min(1).optional(),
  // CSV of league ids to archive, e.g. "18324,18325". An explicit list is EXCLUSIVE: only
  // those leagues are recorded, whatever their tier. Empty/absent hands the decision to
  // ARCHIVE_LEAGUE_TIERS below. Never hardcoded in source — resolve it with
  // scripts/find-league.ts.
  TRACKED_LEAGUE_IDS: z.string().trim().optional(),
  // Which CALIBRE of tournament to record when no explicit id list is given.
  //
  // This replaces the old default of "archive every live league match", which was how a
  // quiet Tuesday full of FACEIT ladders and amateur cups filled the disk at roughly a
  // gigabyte a day with games nobody would ever open. Values are OpenDota's own tier
  // strings, taken from /leagues/{id}: 'premium' (The International, Majors),
  // 'professional' (tier 2-3 circuit), 'amateur' (ladders, open qualifiers, community
  // cups), 'excluded'. Default keeps the first two.
  ARCHIVE_LEAGUE_TIERS: z.string().trim().optional(),
  // Opt-out switch mirroring the existing HISTORY_SAMPLER_DISABLED.
  INGEST_DISABLED: z.string().optional(),
  // The pre-v2.0 name for the same kill switch. It used to be read straight off
  // process.env in ingestJob.ts, which meant a typo in it silently did nothing —
  // a kill switch that may not fire is worse than none.
  HISTORY_SAMPLER_DISABLED: z.string().optional(),
})

const parsed = EnvSchema.superRefine((v, ctx) => {
  // Exactly one Redis configuration must be present. Keep the message keyed on
  // UPSTASH_REDIS_URL so the pre-v2 failure mode still reads the same way.
  if (!v.REDIS_URL) {
    if (!v.UPSTASH_REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['UPSTASH_REDIS_URL'],
        message:
          'UPSTASH_REDIS_URL is required. Get it from https://console.upstash.com — or set REDIS_URL to a local Redis (docker-compose.local.yml).',
      })
    }
    if (!v.UPSTASH_REDIS_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['UPSTASH_REDIS_TOKEN'],
        message:
          'UPSTASH_REDIS_TOKEN is required. Get it from https://console.upstash.com — or set REDIS_URL to a local Redis (docker-compose.local.yml).',
      })
    }
  }

  // Production has two extra requirements, both of which were previously "fail open".
  //
  // CORS_ORIGIN: index.ts falls back to http://localhost:5173 when it is unset. That is
  // the right default for a dev machine and the wrong one for a deployed service, where
  // it means a page served from localhost:5173 on the visitor's own machine can read the
  // API. Failing the boot is better than a config gap nobody notices.
  //
  // API_TOKEN: see the field comment. Deployed and anonymous is the open-proxy shape.
  if (v.NODE_ENV === 'production') {
    if (!v.CORS_ORIGIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGIN'],
        message:
          'CORS_ORIGIN is required when NODE_ENV=production — set it to the exact frontend origin (no trailing slash). Without it the dev fallback would allow http://localhost:5173.',
      })
    }
    if (!v.API_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['API_TOKEN'],
        message:
          'API_TOKEN is required when NODE_ENV=production — /api/* would otherwise be anonymous, and every request spends Valve/Stratz quota. Generate one with `node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'hex\'))"` and set the same value as VITE_API_TOKEN for the frontend build.',
      })
    }
  }
}).safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(`Missing required environment variables:\n${issues}\n\nCopy .env.example to .env and fill in values.`)
}

export const env = parsed.data
export type Env = typeof env

/**
 * Parsed TRACKED_LEAGUE_IDS. Empty set = "no filter, archive everything".
 * Non-numeric entries are dropped rather than throwing — a typo in one id must not
 * stop the whole ingest during a tournament.
 */
export const trackedLeagueIds: ReadonlySet<number> = new Set(
  (env.TRACKED_LEAGUE_IDS ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0),
)

/**
 * Tiers recorded when no explicit id list is configured.
 *
 * 'premium' + 'professional' by default — tier 1 through 3 of the pro circuit, and nothing
 * below it. Amateur ladders run continuously and produce the overwhelming majority of the
 * live feed, so including them is what made the archive grow without bound.
 */
export const DEFAULT_ARCHIVE_TIERS = ['premium', 'professional'] as const

export const archivedLeagueTiers: ReadonlySet<string> = new Set(
  (env.ARCHIVE_LEAGUE_TIERS ?? DEFAULT_ARCHIVE_TIERS.join(','))
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
)

/**
 * True when this league is on the explicit list.
 *
 * Kept separate from the tier decision because an explicit id is an instruction, not a
 * preference: it bypasses the tier check entirely, so a brand-new tournament OpenDota has
 * not indexed yet can still be recorded by adding its id.
 */
export function isTrackedLeague(leagueId: number | undefined): boolean {
  return typeof leagueId === 'number' && trackedLeagueIds.has(leagueId)
}

/** True when an explicit id list was configured, which makes it the only rule that applies. */
export function hasExplicitLeagueList(): boolean {
  return trackedLeagueIds.size > 0
}

/**
 * Does a league of this tier get recorded?
 *
 * `null`/unknown is NOT archived. That is deliberate and it is the conservative direction:
 * an unrecognised league is far more likely to be an amateur cup OpenDota has never indexed
 * than a major nobody has heard of, and the explicit id list exists precisely for the rare
 * case where it is the latter.
 */
export function shouldArchiveTier(tier: string | null | undefined): boolean {
  if (!tier) return false
  return archivedLeagueTiers.has(tier.trim().toLowerCase())
}
