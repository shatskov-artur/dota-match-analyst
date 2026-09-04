import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

/**
 * One flat config for the whole monorepo.
 *
 * The project had no linter at all, and `tsc` does not cover what one is for: unused
 * imports and variables, promises dropped on the floor, and — the expensive one here —
 * React hook dependency arrays. `useArchive.ts` alone is 500 lines of queries and memos,
 * and a missing dependency there is a silent wrong answer rather than a crash. One such
 * bug was found by hand during the audit (MatchEventFeed's `heroOwners`), which is a poor
 * way to find the second.
 *
 * Type-aware rules are enabled through `projectService`, so anything genuinely useful —
 * no-floating-promises, no-misused-promises — actually runs. That is also why scripts/
 * needed a tsconfig of its own: nothing covered it, so nothing typechecked it either.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-demo/**',
      '**/.pgdata/**',
      '**/.tmp/**',
      '**/drizzle/**',
      // Tooling and workflow artifacts, not this project's source.
      '.claude/**',
      '.planning/**',
      'demo-data/**',
      'eslint.config.mjs',
    ],
  },

  js.configs.recommended,
  // `recommended`, not `recommendedTypeChecked`.
  //
  // The type-checked preset reported 187 problems on first run, and 116 of them were
  // no-unnecessary-type-assertion and require-await in test mocks — style opinions about
  // code that works. A linter introduced at 187 errors is a linter nobody runs, and the
  // rules worth having would have been invisible inside the noise. So: the base preset,
  // plus the type-aware rules that catch real defects, enabled by name below.
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unused code, the thing tsc was never asked to report. The audit found eight dead
      // exports by grep; this is what should have found them.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // The two type-aware rules worth the whole projectService setup. A dropped promise
      // in the ingest job is a database write that silently never happened, and an async
      // function passed where a void one is expected is the same bug wearing a callback.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // Every external payload here is genuinely unknown until zod parses it, and Valve
      // moves fields between the top level and `scoreboard` without warning, so narrowing
      // with a cast is the established pattern rather than an escape hatch.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // ─── Client: React ──────────────────────────────────────────────────────────
  {
    files: ['client/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The reason the linter is here. A stale dependency array on a page driven by five
      // pollers does not crash — it quietly shows last minute's answer.
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // ─── Server and scripts: Node ───────────────────────────────────────────────
  {
    files: ['server/**/*.ts', 'scripts/**/*.{ts,mjs}', 'shared/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // ─── Files outside the app tsconfigs ────────────────────────────────────────
  //
  // Build config, vitest setup and the one-off scripts belong to no tsconfig that
  // projectService can find, so type-aware parsing fails on them outright. They still get
  // syntax and unused-variable checking here, and `npm run typecheck:scripts` covers
  // scripts/ with real types — the two type-aware rules are simply off for this set.
  {
    files: [
      '**/*.mjs',
      '**/*.config.ts',
      'client/vitest.setup.ts',
      'scripts/**/*.ts',
      'server/scripts/**/*.ts',
    ],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: false, project: false },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },

  // ─── Tests ──────────────────────────────────────────────────────────────────
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      // A test may assert on a deliberately wrong shape; that is the point of the test.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
)
