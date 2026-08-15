#!/usr/bin/env tsx
/**
 * Local Postgres without Docker, WSL, or admin rights.
 *
 *   npm run pg:start --prefix server      # foreground; Ctrl+C stops it
 *
 * `embedded-postgres` downloads a real Postgres binary on first run and manages a
 * cluster in server/.pgdata. It is a genuine Postgres server on a real TCP port, so
 * psql, drizzle-kit and the BFF all talk to it exactly as they would to a cloud
 * instance — moving to a paid Postgres later is a DATABASE_URL change and nothing else.
 *
 * docker-compose.local.yml stays in the repo as the equivalent path for machines that
 * do have Docker; the two are interchangeable (same port, same credentials).
 */
import EmbeddedPostgres from 'embedded-postgres'
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(here, '..', '.pgdata')

const USER = 'dota'
const PASSWORD = 'dota'
const DATABASE = 'dota_stats'

/**
 * Port resolution, most specific first: PG_PORT → the port in DATABASE_URL → 55432.
 *
 * Reading DATABASE_URL means the cluster and the app can never disagree about where the
 * archive lives: change one line in server/.env and both follow.
 *
 * 55432 rather than 5432 because this machine already runs a PostgreSQL 18 Windows
 * service on the default port. Sitting beside it needs no admin rights, no password to
 * discover, and cannot write tournament data into someone else's cluster.
 */
function resolvePort(): number {
  const explicit = Number(process.env.PG_PORT)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  const url = process.env.DATABASE_URL
  if (url) {
    try {
      const parsed = new URL(url)
      if (parsed.port) return Number(parsed.port)
    } catch {
      /* malformed DATABASE_URL — fall through to the default */
    }
  }
  return 55432
}

const PORT = resolvePort()

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  onLog: (msg: string) => {
    // Postgres is chatty on startup; only surface things that matter.
    if (/error|fatal|panic/i.test(msg)) console.error('[pg]', msg.trim())
  },
})

let stopping = false
async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  stopping = true
  console.log(`\n[pg] ${signal} — stopping…`)
  try {
    await pg.stop()
  } catch (err) {
    console.error('[pg] stop failed:', (err as Error).message)
  }
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

/**
 * Refuse to start on an occupied port with an explanation rather than a stack trace.
 *
 * The case that actually happens: Postgres was force-killed (task manager, a hard reboot
 * of the terminal) instead of being stopped with Ctrl+C. Windows leaves the socket bound
 * to the dead pid for a while, and `pg_ctl stop` cannot signal it either. It clears on its
 * own within a few minutes; nothing needs repairing.
 */
async function portIsFree(port: number): Promise<boolean> {
  const net = await import('node:net')
  return new Promise((resolve) => {
    const probe = net.createConnection({ host: '127.0.0.1', port })
    probe.on('connect', () => {
      probe.destroy()
      resolve(false)
    })
    probe.on('error', () => resolve(true))
    setTimeout(() => {
      probe.destroy()
      resolve(true)
    }, 1500).unref()
  })
}

if (!(await portIsFree(PORT))) {
  console.error(
    `\n[pg] Port ${PORT} is already in use.\n\n` +
      '  If you already have `npm run pg:start` running in another terminal, that is all you need —\n' +
      '  leave it be and start only the app (`npm run dev`).\n\n' +
      '  If nothing is running, a previously force-killed Postgres is still holding the socket.\n' +
      '  It releases itself within a few minutes; no repair is needed. Or use another port:\n' +
      `      PG_PORT=55433 npm run pg:start --prefix server\n` +
      '      # and point DATABASE_URL at it in server/.env\n',
  )
  process.exit(1)
}

// initialise() is a no-op guard away from destroying an existing cluster: it must run
// exactly once, on a directory that does not yet hold a cluster.
const { existsSync } = await import('node:fs')
if (!existsSync(resolve(dataDir, 'PG_VERSION'))) {
  console.log(`[pg] initialising cluster in ${dataDir} (first run downloads the binary)…`)
  await pg.initialise()
}

await pg.start()
console.log(`[pg] listening on localhost:${PORT}`)

// Create the database explicitly instead of pg.createDatabase(), because the ENCODING
// matters and that helper does not set it. initdb inherits the Windows system locale,
// which on this machine is WIN1250 — a cluster-default database then rejects Cyrillic
// player names outright:
//   character with byte sequence 0xd0 0xb6 in encoding "UTF8" has no equivalent in encoding "WIN1250"
// TEMPLATE template0 is what allows a per-database encoding that differs from the
// cluster default; LC_*='C' keeps sorting deterministic and locale-independent.
{
  const admin = postgres(`postgres://${USER}:${PASSWORD}@localhost:${PORT}/postgres`, {
    max: 1,
    onnotice: () => {},
  })
  try {
    const existing = await admin`
      select pg_encoding_to_char(encoding) as enc from pg_database where datname = ${DATABASE}
    `
    if (existing.length === 0) {
      await admin.unsafe(
        `create database "${DATABASE}" with encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'`,
      )
      console.log(`[pg] created database "${DATABASE}" (UTF8)`)
    } else if (existing[0].enc !== 'UTF8') {
      console.error(
        `\n[pg] WARNING: database "${DATABASE}" has encoding ${existing[0].enc}, not UTF8.\n` +
          '     Cyrillic player names cannot be stored. Recreate it:\n' +
          `       drop database "${DATABASE}";\n` +
          `       create database "${DATABASE}" with encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C';\n`,
      )
    } else {
      console.log(`[pg] database "${DATABASE}" already present (UTF8)`)
    }
  } finally {
    await admin.end()
  }
}

console.log(
  `\n  DATABASE_URL=postgres://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}\n\n` +
    '  Leave this running. Apply migrations in another terminal:\n' +
    '    npm run db:migrate --prefix server\n',
)
