import pino from 'pino'

/**
 * Shared pino logger.
 * Used by Phase 9 onwards (D-05 — Roshan kill detection logs).
 *
 * Level: 'info' in production, 'debug' otherwise.
 * No transports — JSON output goes to stdout. Railway/Vercel collectors pick it up.
 */
export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: undefined,
})

/**
 * A loggable one-line summary of an error.
 *
 * Drizzle's query errors embed the entire SQL statement AND every bound parameter, which
 * for a bracket upsert is several kilobytes of stream URLs and league blobs on a single
 * log line — unreadable, and a params dump is exactly the kind of thing that should not
 * be sprayed into logs by default. Keep the first line, capped.
 */
export function briefError(err: unknown, max = 200): string {
  const raw = err instanceof Error ? err.message : String(err)
  const firstLine = raw.split('\n')[0]
  return firstLine.length > max ? `${firstLine.slice(0, max)}…` : firstLine
}

/**
 * Structured throttle-event log (D-04). Emitted once per failed upstream attempt
 * (queue defer / 429 backoff) from cached()'s onFailedAttempt.
 *
 * SECURITY (T-11-02): status-only — the field type permits NO url, key, or token.
 * Mirrors the existing [stratzApi]/[valveApi] "status/statusText only" discipline so
 * no secret ever reaches the Railway log collector.
 *
 * Object-first / message-second call style — same as index.ts (`logger.info({ signal }, '...')`).
 */
export function logThrottle(fields: {
  upstream: string
  attempt: number
  retriesLeft: number
  status?: number
  delayMs?: number | null
}): void {
  logger.warn(fields, 'upstream throttle')
}
