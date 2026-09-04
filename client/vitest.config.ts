import { defineConfig, mergeConfig } from 'vitest/config'
// Extension included deliberately: Vite 8's native config loader cannot resolve an
// extensionless relative import, and it becomes the default in a future major.
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./vitest.setup.ts'],
    },
  }),
)
