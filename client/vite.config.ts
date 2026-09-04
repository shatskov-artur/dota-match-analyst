import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// NOTE: kept as a plain object, not a ({ mode }) => config callback — vitest.config.ts
// mergeConfig()s this export and cannot merge a callback.
//
// The demo build's relative asset base is passed on the command line instead
// (`vite build --mode demo --base ./`, see package.json → build:demo). It must NOT be set
// here for every build: with BrowserRouter a relative base makes /match/123 resolve its
// assets to /match/assets/* and 404.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname,'../shared'),
    },
  },
  server: {
    // demo-data/ and shared/ live above the client root; allow the dev server to read them.
    fs: {
      allow: [path.resolve(import.meta.dirname,'..')],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // rewrite removed — backend already uses /api prefix
      },
    },
  },
})
