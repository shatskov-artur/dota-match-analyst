import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

// Standalone migration runner.
//
//   npm run db:migrate --prefix server          local, via tsx, from server/
//   npm run db:migrate:deploy --prefix server   the deploy, via node, from the repo root
//
// Deliberately does NOT import ../env.js — that module requires VALVE_API_KEY and
// STRATZ_TOKEN, and applying migrations must work on a bare checkout with nothing
// but DATABASE_URL set.

/**
 * `--if-configured` makes a missing DATABASE_URL a clean no-op instead of an error.
 *
 * The deploy runs this before the server starts, and the archive is optional by design:
 * a BFF with no DATABASE_URL still serves every /api/live/* route. Failing the boot there
 * would turn an intentional configuration into an outage. Run by hand, with no flag, a
 * missing URL is still an error — that invocation only ever means "migrate my database".
 */
const ifConfigured = process.argv.includes('--if-configured')

const url = process.env.DATABASE_URL
if (!url) {
  if (ifConfigured) {
    console.log('DATABASE_URL is not set — skipping migrations (the archive is not configured).')
    process.exit(0)
  }
  console.error(
    'DATABASE_URL is not set.\n' +
      'Start the local stack:  docker compose -f docker-compose.local.yml up -d\n' +
      'Then add to server/.env: DATABASE_URL=postgres://dota:dota@localhost:5432/dota_stats',
  )
  process.exit(1)
}

/**
 * Where the .sql files are, resolved from this module rather than the CWD.
 *
 * `./drizzle` worked only because npm ran it with the CWD set to server/. The deploy runs
 * the compiled file from the repo root, where that path does not exist — so migrations
 * silently had no folder to apply, which is precisely the failure this runner exists to
 * prevent. Source and build sit at different depths, hence two candidates rather than one.
 */
function resolveMigrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(here, '../../drizzle'), // tsx:  server/src/db → server/
    resolve(here, '../../../../drizzle'), // build: server/dist/server/src/db → server/
    resolve(process.cwd(), 'server/drizzle'),
    resolve(process.cwd(), 'drizzle'),
  ]
  const found = candidates.find((p) => existsSync(p))
  if (!found) {
    console.error(`migration folder not found. Looked in:\n${candidates.map((p) => `  ${p}`).join('\n')}`)
    process.exit(1)
  }
  return found
}

const migrationsFolder = resolveMigrationsFolder()

// max:1 — migrations must run serially on a single connection.
const sql = postgres(url, { max: 1, onnotice: () => {} })

try {
  await migrate(drizzle(sql), { migrationsFolder })
  console.log(`migrations applied from ${migrationsFolder}`)
} catch (err) {
  console.error('migration failed:', (err as Error).message)
  process.exitCode = 1
} finally {
  await sql.end()
}
