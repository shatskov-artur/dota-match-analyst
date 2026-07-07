/**
 * Parse a 429 `Retry-After` header (RESEARCH Pattern 2).
 * The header is either an integer number of seconds OR an HTTP-date.
 * Returns the delay in milliseconds, or null when absent/unparseable.
 *
 * Attached to a thrown rate-limit error as `retryAfterMs` so cached()'s onFailedAttempt
 * can honor it additively on top of pRetry's exponential backoff.
 */
export function parseRetryAfter(res: Response): number | null {
  const h = res.headers.get('retry-after')
  if (!h) return null
  const secs = Number(h)
  if (Number.isFinite(secs)) return secs * 1000
  const date = Date.parse(h)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null
}
