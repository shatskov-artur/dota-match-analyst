/**
 * What is actually in the archive — a one-shot readout.
 *
 *   npm run db:peek --prefix server                 # everything, summarised
 *   npm run db:peek --prefix server -- --league=19719
 *   npm run db:peek --prefix server -- --match=8942152024
 *
 * Exists because the interesting question is never "list a table", it is "did tonight's
 * games land, and with how much detail". A match recorded live has snapshots and can be
 * scrubbed; one recovered from OpenDota afterwards has minutes and events but no
 * snapshots, and that difference is invisible in a plain row dump.
 */
import postgres from 'postgres'

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. Run via `npm run db:peek --prefix server`, which loads server/.env.')
  process.exit(1)
}

const sql = postgres(url, { onnotice: () => {} })
const leagueFilter = arg('league') ? Number(arg('league')) : null
const matchFilter = arg('match') ? Number(arg('match')) : null

function heading(text: string): void {
  console.log(`\n\x1b[1m${text}\x1b[0m`)
}

async function overview(): Promise<void> {
  heading('Leagues')
  console.table(
    await sql`
      select l.league_id, l.name,
             count(distinct m.match_id)::int as matches,
             count(distinct n.node_id)::int  as bracket_nodes,
             to_char(l.last_synced_at, 'DD Mon HH24:MI') as synced
      from leagues l
      left join matches m       on m.league_id = l.league_id
      left join bracket_nodes n on n.league_id = l.league_id
      group by l.league_id, l.name, l.last_synced_at
      order by matches desc, l.league_id`,
  )

  heading('Matches by state')
  // snapshot_count separates "watched live" from "recovered afterwards": only a match
  // with snapshots can be scrubbed minute by minute.
  console.table(
    await sql`
      select ingest_status,
             count(*)::int as matches,
             count(*) filter (where snapshot_count > 0)::int as with_snapshots,
             count(*) filter (where snapshot_count = 0)::int as backfilled_only
      from matches
      ${leagueFilter ? sql`where league_id = ${leagueFilter}` : sql``}
      group by ingest_status
      order by matches desc`,
  )
}

async function recentMatches(): Promise<void> {
  heading('Latest matches')
  console.table(
    await sql`
      select m.match_id, m.league_id, m.series_id, m.game_in_series as game,
             coalesce(m.radiant_team_name, '?') || ' vs ' || coalesce(m.dire_team_name, '?') as teams,
             m.radiant_score || ':' || m.dire_score as score,
             m.ingest_status as status,
             m.snapshot_count as snaps,
             (select count(*)::int from match_timeline t where t.match_id = m.match_id) as minutes,
             (select count(*)::int from match_events e where e.match_id = m.match_id) as events,
             to_char(to_timestamp(m.start_time), 'DD Mon HH24:MI') as started
      from matches m
      ${leagueFilter ? sql`where m.league_id = ${leagueFilter}` : sql``}
      order by m.start_time desc nulls last, m.match_id desc
      limit 20`,
  )
}

async function seriesBreakdown(): Promise<void> {
  heading('Series (the Game 1/2/3 tabs)')
  console.table(
    await sql`
      select s.series_id, s.league_id, s.series_type,
             coalesce(s.team_1_name, '?') || ' vs ' || coalesce(s.team_2_name, '?') as teams,
             count(m.match_id)::int as maps_recorded,
             jsonb_array_length(coalesce(s.match_ids, '[]'::jsonb)) as maps_known
      from series s
      left join matches m on m.series_id = s.series_id
      ${leagueFilter ? sql`where s.league_id = ${leagueFilter}` : sql``}
      group by s.series_id, s.league_id, s.series_type, s.team_1_name, s.team_2_name, s.match_ids
      order by maps_recorded desc, s.series_id desc
      limit 15`,
  )
}

async function oneMatch(matchId: number): Promise<void> {
  const [row] = await sql`select * from matches where match_id = ${matchId}`
  if (!row) {
    console.log(`\nMatch ${matchId} is not in the archive.`)
    return
  }
  heading(`Match ${matchId}`)
  console.log({
    teams: `${row.radiant_team_name ?? '?'} vs ${row.dire_team_name ?? '?'}`,
    score: `${row.radiant_score}:${row.dire_score}`,
    winner: row.radiant_win === null ? 'unknown' : row.radiant_win ? 'Radiant' : 'Dire',
    league: row.league_id,
    series: row.series_id,
    gameInSeries: row.game_in_series,
    status: row.ingest_status,
  })

  const [cov] = await sql`
    select (select count(*)::int from match_timeline  where match_id = ${matchId}) as minutes,
           (select count(*)::int from player_timeline where match_id = ${matchId}) as player_rows,
           (select count(*)::int from match_snapshots where match_id = ${matchId}) as snapshots,
           (select count(*)::int from match_analysis  where match_id = ${matchId}) as analysis`
  heading('Coverage')
  console.log({
    ...cov,
    // The one distinction that decides what the UI can show.
    scrubbable: Number(cov.snapshots) > 0 ? 'yes — full minute-by-minute replay' : 'no — no live snapshots recorded',
  })

  heading('Events')
  console.table(await sql`
    select type, count(*)::int as n from match_events where match_id = ${matchId} group by type order by n desc`)

  heading('First 10 events')
  // The human-readable text lives in the payload; the UI formats it, so show the raw
  // shape here rather than half-reimplementing that formatting.
  console.table(
    (
      await sql`
        select t, type, team, source, payload
        from match_events where match_id = ${matchId} order by t limit 10`
    ).map((e) => ({
      // Draft events carry NEGATIVE game seconds — the picks happen before the horn.
      // Sign belongs on the whole clock, not on the seconds.
      at: `${e.t < 0 ? '-' : ''}${Math.floor(Math.abs(e.t) / 60)}:${String(Math.abs(e.t) % 60).padStart(2, '0')}`,
      type: e.type,
      team: e.team === 0 ? 'radiant' : e.team === 1 ? 'dire' : '',
      source: e.source,
      payload: JSON.stringify(e.payload ?? {}).slice(0, 70),
    })),
  )
}

try {
  if (matchFilter !== null) {
    await oneMatch(matchFilter)
  } else {
    await overview()
    await seriesBreakdown()
    await recentMatches()
    console.log('\nDrill into one game with:  npm run db:peek --prefix server -- --match=<id>')
  }
} finally {
  await sql.end()
}
