import { Hono } from 'hono'
import { getHeroStats } from '../services/openDotaApi.js'

const heroRoutes = new Hono()

/**
 * GET /api/heroes/stats
 * Returns global patch hero win_rate and pick_rate as a map keyed by hero_id.
 * Cached 6h server-side (TTL.HERO_STATS) — one call per 6h regardless of viewer count.
 * Response shape: { [heroId: string]: { win_rate: number; pick_rate: number } }
 *
 * URL derivation: heroRoutes mounted at /api → heroRoutes.get('/heroes/stats') → /api/heroes/stats
 *
 * SECURITY:
 *  - T-5-02: catch block returns opaque 502 — no upstream details exposed.
 *  - T-5-03: getHeroStats() uses .safeParse() internally — malformed JSON → null → 502.
 */
heroRoutes.get('/heroes/stats', async (c) => {
  try {
    const stats = await getHeroStats()
    if (!stats) return c.json({ error: 'Upstream error' }, 502)
    return c.json(stats)
  } catch {
    return c.json({ error: 'Upstream error' }, 502)
  }
})

export default heroRoutes
