import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.string().default('3001'),
  UPSTASH_REDIS_URL: z.string().min(1, 'UPSTASH_REDIS_URL is required. Get it from https://console.upstash.com'),
  UPSTASH_REDIS_TOKEN: z.string().min(1, 'UPSTASH_REDIS_TOKEN is required. Get it from https://console.upstash.com'),
  VALVE_API_KEY: z.string().min(1, 'VALVE_API_KEY is required. Get it from https://steamcommunity.com/dev/apikey'),
  STRATZ_TOKEN: z.string().min(1, 'STRATZ_TOKEN is required. Get it from https://stratz.com/api'),  // D-01
  // Exact Vercel URL in prod; optional so local boot works.
  // Browsers never send a trailing slash in the Origin header, and Hono compares the
  // configured origin verbatim — so a dashboard value like "https://app.vercel.app/"
  // silently blocks every request. Strip it here rather than rely on the operator.
  CORS_ORIGIN: z.string().trim().transform((s) => s.replace(/\/+$/, '')).optional(),
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(`Missing required environment variables:\n${issues}\n\nCopy .env.example to .env and fill in values.`)
}

export const env = parsed.data
export type Env = typeof env
