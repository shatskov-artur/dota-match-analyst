import { defineConfig } from 'vitest/config'

/**
 * The server had no vitest config at all, and did not need one until vitest 4: its default
 * file discovery now reaches into `dist/`, so `npm run build` followed by `npm test` ran
 * every suite twice — once from source and once from the compiled copy. The compiled copy
 * then failed for reasons that say nothing about the code: `shared/heroMapper.js` resolves
 * `./heroes.json` with createRequire, and tsc does not copy JSON assets into the output.
 *
 * dist is build output. It is never a test target.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'dist/**'],
  },
})
