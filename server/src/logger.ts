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
