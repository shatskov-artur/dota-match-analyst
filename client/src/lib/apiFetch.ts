import { API_BASE } from './apiBase'

/**
 * Single entry point for every BFF request.
 *
 * Normal build: a plain fetch against API_BASE, identical to what the hooks did before.
 * Demo build (VITE_DEMO_MODE=1): the request is answered from the static snapshot in
 * demo-data/ and NO network call is made — not to the BFF, not to Valve, OpenDota or Stratz.
 *
 * WHY A WRAPPER RATHER THAN PATCHING window.fetch
 * `import.meta.env.VITE_DEMO_MODE` is substituted by Vite at build time, so `IS_DEMO` is a
 * compile-time constant and the unused branch is dropped by the bundler. A production build
 * therefore contains no snapshot and no demo code; a demo build contains no network path at
 * all. Patching the global fetch would ship both branches in both builds and would be far
 * harder to reason about from the Network tab.
 *
 * Returns a real Response, so callers keep using res.ok / res.status / res.json() unchanged.
 */
export const IS_DEMO = import.meta.env.VITE_DEMO_MODE === '1'

/**
 * The snapshot is pulled in through a dynamic import so it forms its own chunk and is
 * unreachable — hence removed — when IS_DEMO is false. Cached after first use.
 */
let snapshotModule: Promise<typeof import('../demo/snapshot')> | null = null
function loadSnapshot(): Promise<typeof import('../demo/snapshot')> {
  snapshotModule ??= import('../demo/snapshot')
  return snapshotModule
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Shared secret for the BFF, when one is configured.
 *
 * The server requires API_TOKEN under NODE_ENV=production because an anonymous BFF is an
 * open tap on someone's Valve and Stratz quota. Vite inlines VITE_* at build time, so this
 * value ships inside the bundle and is NOT a secret from anyone who opens the network tab —
 * it stops crawlers and accidental discovery, and the server's rate limiter bounds what any
 * one client can spend. Per-user auth would be a different feature.
 *
 * Unset in dev and in the demo build, where it is simply not sent.
 */
const API_TOKEN = import.meta.env.VITE_API_TOKEN as string | undefined

const authHeaders: HeadersInit | undefined = API_TOKEN
  ? { Authorization: `Bearer ${API_TOKEN}` }
  : undefined

/**
 * @param path BFF path beginning with `/api/`, e.g. `/api/live/games`.
 */
export async function apiFetch(path: string): Promise<Response> {
  if (IS_DEMO) {
    const { resolveDemoResponse } = await loadSnapshot()
    const { currentSlice } = await import('../demo/cursor')
    const payload = resolveDemoResponse(path, currentSlice())
    // Nothing captured for this path at this point in the replay. 404 mirrors what the live
    // BFF answered for a match that was not in the live list at that moment — the hooks
    // already handle it (MatchPage says the match is not in the recording here, the rest
    // degrade quietly).
    if (payload === null) return jsonResponse({ error: 'Not in demo snapshot' }, 404)
    return jsonResponse(payload, 200)
  }
  return fetch(`${API_BASE}${path}`, authHeaders ? { headers: authHeaders } : undefined)
}
