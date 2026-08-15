import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

// Standalone migration runner: `npm run db:migrate --prefix server`.
//
// Deliberately does NOT import ../env.js — that module requires VALVE_API_KEY and
// STRATZ_TOKEN, and applying migrations must work on a bare checkout with nothing
// but DATABASE_URL set.

const url = process.env.DATABASE_URL
if (!url) {
  console.error(
    'DATABASE_URL is not set.\n' +
      'Start the local stack:  docker compose -f docker-compose.local.yml up -d\n' +
      'Then add to server/.env: DATABASE_URL=postgres://dota:dota@localhost:5432/dota_stats',
  )
  process.exit(1)
}

// max:1 — migrations must run serially on a single connection.
const sql = postgres(url, { max: 1, onnotice: () => {} })

try {
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' })
  console.log('migrations applied')
} catch (err) {
  console.error('migration failed:', (err as Error).message)
  process.exitCode = 1
} finally {
  await sql.end()
}
