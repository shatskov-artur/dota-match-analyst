/**
 * Delete match rows for leagues that are not being recorded.
 *
 *   npm run db:prune --prefix server            # report only
 *   npm run db:prune --prefix server -- --apply # actually delete
 *
 * Why this exists: schedules are synced for every live league so the app can answer "what
 * is on this week", and for a while that also created a match row per match id those
 * leagues published. A community league publishes its ENTIRE history there — five of them
 * put 21,000 rows in the backfill queue and pushed The International to the back of it.
 * tournamentSync no longer stubs untracked leagues; this clears what it already made.
 *
 * Only ever removes rows with nothing in them: no snapshots, no timeline, no events. A
 * match that was actually recorded is kept whatever league it belongs to, because that is
 * a real recording that someone chose to make.
 */
import postgres from 'postgres'

const apply = process.argv.includes('--apply')
const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. Run via `npm run db:prune --prefix server`.')
  process.exit(1)
}
const tracked = (process.env.TRACKED_LEAGUE_IDS ?? '')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)

const sql = postgres(url, { onnotice: () => {} })

// Empty means "record everything", and then nothing here is stray. Refuse rather than
// interpret an unset variable as permission to delete every match in the archive.
if (tracked.length === 0) {
  console.error('TRACKED_LEAGUE_IDS is empty — every league counts as tracked, nothing to prune.')
  await sql.end()
  process.exit(1)
}

const doomed = await sql<{ match_id: number }[]>`
  select m.match_id
  from matches m
  where (m.league_id is null or m.league_id <> all(${tracked}))
    and m.snapshot_count = 0
    and not exists (select 1 from match_timeline  t where t.match_id = m.match_id)
    and not exists (select 1 from player_timeline p where p.match_id = m.match_id)
    and not exists (select 1 from match_events    e where e.match_id = m.match_id)`

console.log(`tracked leagues: ${tracked.join(', ')}`)
console.table(
  await sql`
    select m.league_id, l.name, count(*)::int as empty_stubs
    from matches m left join leagues l on l.league_id = m.league_id
    where m.match_id = any(${doomed.map((d) => d.match_id)})
    group by 1, 2 order by empty_stubs desc limit 12`,
)
console.log(`${doomed.length} empty stubs${apply ? '' : ' — pass --apply to delete'}`)

if (apply && doomed.length > 0) {
  const ids = doomed.map((d) => d.match_id)
  // Chunked: one statement with 21k parameters is a needless spike.
  let removed = 0
  for (let i = 0; i < ids.length; i += 2000) {
    const chunk = ids.slice(i, i + 2000)
    const res = await sql`delete from matches where match_id = any(${chunk})`
    removed += res.count
  }
  // Series rows whose every match just went away carry nothing a schedule can use.
  const series = await sql`
    delete from series s
    where s.league_id <> all(${tracked})
      and not exists (select 1 from matches m where m.series_id = s.series_id)`
  console.log(`deleted ${removed} matches and ${series.count} orphaned series`)
}

console.table(
  await sql`select ingest_status, count(*)::int as n from matches group by 1 order by n desc`,
)
await sql.end()
