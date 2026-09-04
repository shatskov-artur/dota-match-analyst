import { createHash, timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import { env } from '../env.js'
import { logger } from '../logger.js'

/**
 * Shared-secret gate for /api/*.
 *
 * Accepts either `Authorization: Bearer <token>` or `X-Api-Token: <token>`. The second
 * exists because the token has to reach the BFF from a browser fetch, and a plain header
 * is one less thing to get wrong than an auth scheme.
 *
 * When API_TOKEN is unset the middleware is a pass-through. That keeps `npm run dev` and
 * the local-only archive working with no configuration, and env.ts makes the variable
 * mandatory as soon as NODE_ENV=production — so "unset" can only mean "local".
 *
 * SECURITY: the comparison hashes both sides first so timingSafeEqual gets equal-length
 * buffers, and so the compare time carries no information about the token's length.
 * The rejection body says nothing about which header was read or why it failed.
 */
function matches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/** Paths that answer before the gate. Railway polls this to decide if the deploy is alive. */
const PUBLIC_PATHS = new Set(['/api/health'])

export function requireApiToken(): MiddlewareHandler {
  const expected = env.API_TOKEN

  if (!expected) {
    logger.warn(
      'API_TOKEN is not set — /api/* is unauthenticated. Fine for a local machine; ' +
        'env.ts rejects this configuration under NODE_ENV=production.',
    )
    return async (_c, next) => {
      await next()
    }
  }

  return async (c, next) => {
    if (PUBLIC_PATHS.has(c.req.path)) {
      await next()
      return
    }

    const header = c.req.header('authorization')
    const bearer = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : undefined
    const provided = bearer || c.req.header('x-api-token')?.trim()

    if (!provided || !matches(provided, expected)) {
      logger.warn({ path: c.req.path, presented: Boolean(provided) }, 'api token rejected')
      return c.json({ error: 'Unauthorized' }, 401)
    }

    await next()
  }
}
