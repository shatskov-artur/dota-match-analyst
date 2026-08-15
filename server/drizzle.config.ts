import { defineConfig } from 'drizzle-kit'

// Migrations are generated from src/db/schema.ts and applied with `npm run db:migrate`.
// DATABASE_URL comes from server/.env — the db:* scripts load it with --env-file.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
})
