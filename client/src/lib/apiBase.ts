// Base URL for all BFF requests.
//
// Vite inlines `import.meta.env.VITE_API_URL` at BUILD time (not runtime), so the
// production bundle bakes in the Railway BFF origin when VITE_API_URL is set before
// `vite build`. When VITE_API_URL is unset (local dev), API_BASE is '' and requests
// stay relative (`/api/...`), so the Vite dev proxy in vite.config.ts continues to
// forward `/api/*` to http://localhost:3001.
//
// Must be a bare origin with NO trailing slash and NO `/api` suffix
// (e.g. https://your-bff.up.railway.app). Call-sites append `/api/...`.
export const API_BASE = import.meta.env.VITE_API_URL ?? ''
