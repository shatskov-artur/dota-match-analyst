/// <reference types="vite/client" />

// Typed Vite build-time env vars. VITE_API_URL is the Railway BFF origin
// (no trailing slash, no /api) inlined at build time; optional so local dev
// (unset → API_BASE '') keeps the Vite proxy path working.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  // '1' in the static snapshot build (client/.env.demo). Compile-time constant: apiFetch
  // reads it to pick the snapshot path over the network path, and the bundler drops whichever
  // branch is unreachable.
  readonly VITE_DEMO_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
