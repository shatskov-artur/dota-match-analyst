import { Hono } from 'hono'
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db/index.js'
import {
  leagues,
  teams,
  leagueStandings,
  bracketNodes,
  series as seriesTable,
  matches,
  matchSnapshots,
  matchTimeline,
  matchEvents,
  matchAnalysis,
} from '../db/schema.js'
import { nodeTypeToBestOf, seriesTypeToBestOf } from '../schemas/leagueData.js'
import {
  resolveSeriesScore,
  tallyFromGames,
  tallySeriesWins,
  toSeriesResults,
} from '../services/archive/seriesScore.js'
import { getTeamMatches, getTeamPlayers } from '../services/openDotaApi.js'
import { getLiveLeagueGames } from '../services/valveApi.js'
import { buildH2H } from '../services/h2h.js'
import { deriveRecords, mergeStandings } from '../services/standings.js'
import { reconstructAt } from '../services/archive/reconstruct.js'
import { trackedLeagueIds } from '../env.js'
import { logger, briefError } from '../logger.js'

// Read side of the v2.0 archive. Every route reads Postgres only — no upstream calls,
// so browsing history costs nothing against the Valve/OpenDota/Stratz quotas.
//
// Mounted at /api. The live routes under /api/live/* are untouched.

const archiveRoutes = new Hono()

/**
 * Every route below reads Postgres, and none of them used to guard the read itself.
 * `requireDb()` only answers "is the archive CONFIGURED" — so a database that was
 * configured but unreachable (the embedded Postgres after the machine sleeps, or a
 * restart mid-request) threw straight out of the handler and Hono returned a bare 500
 * with no JSON body. The client's `getJson` then threw, and the home page rendered
 * "Nothing recorded on this day" over a day that was fully recorded.
 *
 * A single error boundary turns that into a 503 the client can recognise, and keeps the
 * distinction that matters: `archive_unavailable` = not configured, `archive_unreachable`
 * = configured but not answering. Neither is "there is no data".
 *
 * Hono wraps each of this sub-app's handlers with this handler when the app is mounted
 * with `app.route()`, so it covers every route here without touching them individually.
 */
archiveRoutes.onError((err, c) => {
  logger.error({ path: c.req.path, err: briefError(err) }, 'archive: request failed')
  return c.json({ error: 'archive_unreachable' }, 503)
})

/** 503 rather than 500: the archive being off is a configuration state, not a crash. */
function requireDb(): NonNullable<typeof db> | null {
  return db ?? null
}

const parseId = (raw: string | undefined): number | null => {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

// ─── Tournaments ─────────────────────────────────────────────────────────────

archiveRoutes.get('/tournaments', async (c) => {
  const d = requireDb()
  if (!d) return c.json({ error: 'archive_unavailable' }, 503)
  const rows = await d.select().from(leagues).orderBy(desc(leagues.startTimestamp))
  return c.json({ tournaments: rows })
})

/**
 * Schedule = every bracket node with its resolved team names, newest phase last.
 * `status` derives from the node's own flags rather than from wall-clock time, because
 * Valve keeps scheduled_time on a node long after it has actually been played.
 */
archiveRoutes.get('/tournaments/:leagueId/schedule', async (c) => {
  const d = requireDb()
  if (!d) return c.json({ error: 'archive_unavailable' }, 503)
  const leagueId = parseId(c.req.param('leagueId'))
  if (leagueId === null) return c.json({ error: 'Invalid leagueId' }, 400)

  const t1 = alias(teams, 't1')
  const t2 = alias(teams, 't2')

  const rows = await d
    .select({
      node: bracketNodes,
      team1: { id: t1.teamId, name: t1.name, tag: t1.tag, logoUrl: t1.logoUrl },
      team2: { id: t2.teamId, name: t2.name, tag: t2.tag, logoUrl: t2.logoUrl },
      matchIds: seriesTable.matchIds,
    })
    .from(bracketNodes)
    .leftJoin(t1, eq(bracketNodes.team1Id, t1.teamId))
    .leftJoin(t2, eq(bracketNodes.team2Id, t2.teamId))
    .leftJoin(seriesTable, eq(bracketNodes.seriesId, seriesTable.seriesId))
    .where(eq(bracketNodes.leagueId, leagueId))
    .orderBy(asc(bracketNodes.scheduledTime), asc(bracketNodes.nodeId))

  // Maps this league has actually decided, which outranks whatever Valve's node still says.
  const tally = await tallySeriesWins(d, { leagueId })

  const wanted = c.req.query('status')
  const shaped = rows.map((r) => {
    const n = r.node
    const bestOf = nodeTypeToBestOf(n.nodeType ?? undefined)
    const score = resolveSeriesScore(
      { seriesId: n.seriesId, team1Id: n.team1Id, team2Id: n.team2Id, team1Wins: n.team1Wins, team2Wins: n.team2Wins, bestOf },
      tally,
    )
    /*
     * A series whose maps are all played is finished, whatever the bracket says. Valve
     * left has_started set and is_completed false on a Bo3 the archive had already
     * recorded 2-0, so it sat under "Live" for hours with a stale 1-0 beside it.
     */
    const status = n.isCompleted || score.decided ? 'finished' : n.hasStarted ? 'live' : 'upcoming'
    return {
      nodeId: n.nodeId,
      nodeGroupId: n.nodeGroupId,
      nodeGroupName: n.nodeGroupName,
      phase: n.phase,
      name: n.name,
      status,
      bestOf,
      scheduledTime: n.scheduledTime,
      actualTime: n.actualTime,
      seriesId: n.seriesId,
      matchIds: r.matchIds ?? [],
      team1: { ...r.team1, wins: score.team1Wins },
      team2: { ...r.team2, wins: score.team2Wins },
      streamIds: n.streamIds,
    }
  })

  return c.json({ schedule: wanted ? shaped.filter((s) => s.status === wanted) : shaped })
})

/** Raw bracket graph + standings, for the client to lay out. */
archiveRoutes.get('/tournaments/:leagueId/bracket', async (c) => {
  const d = requireDb()
  if (!d) return c.json({ error: 'archive_unavailable' }, 503)
  const leagueId = parseId(c.req.param('leagueId'))
  if (leagueId === null) return c.json({ error: 'Invalid leagueId' }, 400)

  const [league] = await d.select().from(leagues).where(eq(leagues.leagueId, leagueId)).limit(1)
  const nodes = await d
    .select()
    .from(bracketNodes)
    .where(eq(bracketNodes.leagueId, leagueId))
    .orderBy(asc(bracketNodes.nodeGroupId), asc(bracketNodes.nodeId))
  const standings = await d
    .select({
      nodeGroupId: leagueStandings.nodeGroupId,
      standing: leagueStandings.standing,
      wins: leagueStandings.wins,
      losses: leagueStandings.losses,
      score: leagueStandings.score,
      teamId: teams.teamId,
      name: teams.name,
      tag: teams.tag,
      logoUrl: teams.logoUrl,
    })
    .from(leagueStandings)
    .leftJoin(teams, eq(leagueStandings.teamId, teams.teamId))
    .where(eq(leagueStandings.leagueId, leagueId))
    .orderBy(asc(leagueStandings.nodeGroupId), asc(leagueStandings.standing))

  // Maps this league has actually decided, counted per series from our own records — the
  // same tally the schedule resolves its scores against, so the two tabs cannot disagree.
  const seriesResults = toSeriesResults(await tallySeriesWins(d, { leagueId }))

  // Group ids referenced by nodes, with their display names — enough for the client to
  // draw columns without re-walking Valve's nested tree.
  const groups = [...new Map(nodes.map((n) => [n.nodeGroupId, { id: n.nodeGroupId, name: n.nodeGroupName, phase: n.phase }])).values()]

  return c.json({
    league: league ?? null,
    groups,
    // bestOf is resolved here, exactly as /schedule does it. It used to be a second copy
    // of the node_type table living in BracketView, which is how the bracket kept saying
    // "Bo2" after the mapping was corrected. One source, no drift.
    nodes: nodes.map((n) => ({ ...n, bestOf: nodeTypeToBestOf(n.nodeType ?? undefined) })),
    seriesResults,
    // Valve leaves wins/losses at 0 long after games have been played, so the table is
    // rebuilt from the completed nodes above and the higher of the two is kept.
    standings: mergeStandings(standings, deriveRecords(nodes)),
  })
})

/**
 * Everything the archive knows about inside a window of wall-clock time — played, running
 * and scheduled alike, across every league.
 *
 * This is the one source behind the home calendar: the dots on the month grid, the list
 * under the selected day and "later today" all come out of a single response, so the
 * calendar cannot disagree with what is rendered beside it.
 *
 * The window arrives as absolute unix seconds rather than a day count because days in this
 * UI are LOCAL and only the browser knows which offset it is in. The client sends the
 * boundaries it drew; the server never guesses a timezone.
 */
archiveRoutes.get('/schedule/range', async (c) => {
  const d = requireDb()
  if (!d) return c.json({ error: 'archive_unavailable' }, 503)

  const from = Number(c.req.query('from'))
  const to = Number(c.req.query('to'))
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return c.json({ error: 'Invalid range: from and to are unix seconds, to > from' }, 400)
  }
  const limit = Math.min(Number(c.req.query('limit') ?? 500) || 500, 800)
  const now = Math.floor(Date.now() / 1000)

  const t1 = alias(teams, 't1')
  const t2 = alias(teams, 't2')

  /**
   * A series lands on the day it was actually played when that is known. Valve never
   * revises scheduled_time, so a match moved by three hours would otherwise put its dot on
   * the wrong day. NULLIF because both columns carry 0 rather than NULL for "unknown" —
   * an unseeded slot has scheduled_time 0 and belongs to no day at all.
   */
  const nodeTime = sql`coalesce(nullif(${bracketNodes.actualTime}, 0), nullif(${bracketNodes.scheduledTime}, 0))`

  const rows = await d
    .select({
      node: bracketNodes,
      leagueName: leagues.name,
      leagueTier: leagues.odTier,
      team1: { id: t1.teamId, name: t1.name, tag: t1.tag, logoUrl: t1.logoUrl },
      team2: { id: t2.teamId, name: t2.name, tag: t2.tag, logoUrl: t2.logoUrl },
      matchIds: seriesTable.matchIds,
      t: nodeTime.as('t'),
    })
    .from(bracketNodes)
    .leftJoin(leagues, eq(bracketNodes.leagueId, leagues.leagueId))
    .leftJoin(t1, eq(bracketNodes.team1Id, t1.teamId))
    .leftJoin(t2, eq(bracketNodes.team2Id, t2.teamId))
    .leftJoin(seriesTable, eq(bracketNodes.seriesId, seriesTable.seriesId))
    .where(sql`${nodeTime} between ${from} and ${to}`)
    .orderBy(sql`${nodeTime} asc`, asc(bracketNodes.nodeId))
    .limit(limit + 1)

  /**
   * Valve's own flags first, wall-clock only to catch what they never revised.
   *
   * `has_started` is set and then forgotten: a node from three days ago still carries it,
   * and a bracket that was played but never marked complete would otherwise dot a past day
   * as "upcoming". Anything old enough, or holding match ids, has clearly been played.
   */
  const settle = (
    started: boolean | null,
    completed: boolean | null,
    decided: boolean,
    played: number,
    t: number,
  ): 'finished' | 'live' | 'upcoming' => {
    // A series someone has already won is over, whatever the bracket still says.
    if (completed || decided) return 'finished'
    const stale = t < now - 6 * 3_600
    if (played > 0 || started) return stale ? 'finished' : 'live'
    // Still "upcoming" while in the past: a slot that was never played. Dropped below
    // rather than dressed up as a result.
    return 'upcoming'
  }

  const kept = rows.slice(0, limit)
  // One tally for the whole window, resolved against every row below — the home list and
  // the tournament's own schedule then quote the same score for the same series.
  const nodeTally = await tallySeriesWins(d, {
    seriesIds: kept.map((r) => r.node.seriesId).filter((id): id is number => id !== null),
  })

  const entries = kept.map((r) => {
    const n = r.node
    const matchIds = r.matchIds ?? []
    const bestOf = nodeTypeToBestOf(n.nodeType ?? undefined)
    const score = resolveSeriesScore(
      { seriesId: n.seriesId, team1Id: n.team1Id, team2Id: n.team2Id, team1Wins: n.team1Wins, team2Wins: n.team2Wins, bestOf },
      nodeTally,
    )
    return {
      leagueId: n.leagueId,
      leagueName: r.leagueName,
      leagueTier: r.leagueTier,
      nodeId: n.nodeId as number | null,
      nodeGroupName: n.nodeGroupName,
      name: n.name,
      status: settle(n.hasStarted, n.isCompleted, score.decided, matchIds.length, Number(r.t)),
      bestOf,
      scheduledTime: n.scheduledTime,
      actualTime: n.actualTime,
      /** The resolved instant the client buckets on. Never 0 — the window excluded those. */
      time: Number(r.t),
      seriesId: n.seriesId,
      matchIds,
      // Normalised rather than spread raw: an unmatched left join is a null object, and
      // every consumer here reads `.name` to decide whether the row says anything.
      team1: { ...(r.team1 ?? {}), name: r.team1?.name ?? null, wins: score.team1Wins },
      team2: { ...(r.team2 ?? {}), name: r.team2?.name ?? null, wins: score.team2Wins },
    }
  })

  /**
   * Series rows the bracket does not account for.
   *
   * A played series reaches the archive by two independent paths, and the second exists
   * precisely for the overnight case: the machine was off, nothing was recorded live, and
   * OpenDota's league history filled the series table while Valve's node still says
   * is_completed = false. Without this union those games are missing from their own day.
   *
   * Tracked leagues only, and for the same reason match rows are: community leagues carry
   * thousands of series apiece — one 30-day window pulled 650 rows, nearly all of them
   * ladder games whose team ids nothing ever resolved. Their brackets are synced, so they
   * still reach the calendar through the nodes above.
   */
  const tracked = [...trackedLeagueIds]
  const s1 = alias(teams, 's1')
  const s2 = alias(teams, 's2')
  const seriesTime = sql`coalesce(nullif(${seriesTable.startTime}, 0), nullif(${seriesTable.scheduledTime}, 0))`
  const seriesRows = await d
    .select({
      s: seriesTable,
      leagueName: leagues.name,
      leagueTier: leagues.odTier,
      team1: { id: s1.teamId, name: s1.name, tag: s1.tag, logoUrl: s1.logoUrl },
      team2: { id: s2.teamId, name: s2.name, tag: s2.tag, logoUrl: s2.logoUrl },
      t: seriesTime.as('t'),
    })
    .from(seriesTable)
    .leftJoin(leagues, eq(seriesTable.leagueId, leagues.leagueId))
    .leftJoin(s1, eq(seriesTable.team1Id, s1.teamId))
    .leftJoin(s2, eq(seriesTable.team2Id, s2.teamId))
    .where(
      and(
        sql`${seriesTime} between ${from} and ${to}`,
        inArray(seriesTable.leagueId, tracked.length > 0 ? tracked : [-1]),
      ),
    )
    .orderBy(sql`${seriesTime} asc`)
    .limit(limit)

  const seenSeries = new Set(entries.map((e) => e.seriesId).filter((id): id is number => id !== null))
  const seenNodes = new Set(entries.map((e) => `${e.leagueId}:${e.nodeId}`))

  const fresh = seriesRows.filter((r) => {
    const s = r.s
    if (s.seriesId !== null && seenSeries.has(s.seriesId)) return false
    if (s.nodeId !== null && seenNodes.has(`${s.leagueId}:${s.nodeId}`)) return false
    return true
  })
  const seriesTally = await tallySeriesWins(d, {
    seriesIds: fresh.map((r) => r.s.seriesId).filter((id): id is number => id !== null),
  })

  for (const r of fresh) {
    const s = r.s
    const bestOf = seriesTypeToBestOf(s.seriesType ?? undefined)
    const resolved = resolveSeriesScore(
      { seriesId: s.seriesId, team1Id: s.team1Id, team2Id: s.team2Id, team1Wins: s.team1Wins, team2Wins: s.team2Wins, bestOf },
      seriesTally,
    )
    const t = Number(r.t)
    const status = settle(!!s.startTime, false, resolved.decided, (s.matchIds ?? []).length, t)
    entries.push({
      leagueId: s.leagueId ?? 0,
      leagueName: r.leagueName,
      leagueTier: r.leagueTier,
      nodeId: s.nodeId,
      nodeGroupName: null,
      name: null,
      status,
      bestOf,
      scheduledTime: s.scheduledTime,
      actualTime: s.startTime,
      time: t,
      seriesId: s.seriesId,
      matchIds: s.matchIds ?? [],
      // A left join that matched nothing arrives as a null object, not an object of
      // nulls. The series table carries its own copy of the names, which is the whole
      // point of this fallback — a row from OpenDota may name teams the bracket never did.
      team1: { ...(r.team1 ?? {}), name: r.team1?.name ?? s.team1Name, wins: resolved.team1Wins },
      team2: { ...(r.team2 ?? {}), name: r.team2?.name ?? s.team2Name, wins: resolved.team2Wins },
    })
  }

  /**
   * Two kinds of row carry nothing a reader can use, and both are plentiful.
   *
   * A slot still marked upcoming days after its own date was never played — Valve leaves
   * those behind by the hundred and a calendar full of them says a day was busy when it
   * was empty. A finished series with no team name on either side is worse: "TBD vs TBD,
   * 2-1" is a result about nobody. Community leagues produce them constantly because
   * nothing ever resolved their team ids.
   */
  const useful = entries.filter((e) => {
    if (e.status === 'upcoming' && e.time < now - 6 * 3_600) return false
    if (e.status === 'finished' && !e.team1.name && !e.team2.name) return false
    return true
  })
  useful.sort((a, b) => a.time - b.time)

  return c.json({
    from,
    to,
    // Silently dropping rows would under-dot the calendar and read as "nothing was on".
    truncated: rows.length > limit,
    schedule: useful,
  })
})

/**
 * Everything worth knowing about a series that has NOT been played yet: the two teams,
 * their rosters, their head-to-head record and recent form.
 *
 * Keyed on (league, node) rather than a match id because an unplayed series has no match
 * ids — Valve only mints those when the first game starts. That is exactly the case this
 * route exists for.
 */
archiveRoutes.get('/tournaments/:leagueId/nodes/:nodeId', async (c) => {
  const d = requireDb()
  if (!d) return c.json({ error: 'archive_unavailable' }, 503)
  const leagueId = parseId(c.req.param('leagueId'))
  const nodeId = Number(c.req.param('nodeId'))
  if (leagueId === null || !Number.isFinite(nodeId)) return c.json({ error: 'Invalid node' }, 400)

  const t1 = alias(teams, 't1')
  const t2 = alias(teams, 't2')
  const [row] = await d
    .select({
      node: bracketNodes,
      leagueName: leagues.name,
      team1: { id: t1.teamId, name: t1.name, tag: t1.tag, logoUrl: t1.logoUrl },
      team2: { id: t2.teamId, name: t2.name, tag: t2.tag, logoUrl: t2.logoUrl },
      matchIds: seriesTable.matchIds,
    })
    .from(bracketNodes)
    .leftJoin(leagues, eq(bracketNodes.leagueId, leagues.leagueId))
    .leftJoin(t1, eq(bracketNodes.team1Id, t1.teamId))
    .leftJoin(t2, eq(bracketNodes.team2Id, t2.teamId))
    .leftJoin(seriesTable, eq(bracketNodes.seriesId, seriesTable.seriesId))
    .where(and(eq(bracketNodes.leagueId, leagueId), eq(bracketNodes.nodeId, nodeId)))
    .limit(1)

  if (!row) return c.json({ error: 'Node not found' }, 404)

  const id1 = row.node.team1Id
  const id2 = row.node.team2Id

  // allSettled throughout: a team OpenDota has never heard of must not blank the page.
  const [m1, m2, p1, p2] = await Promise.allSettled([
    id1 ? getTeamMatches(id1) : Promise.resolve(null),
    id2 ? getTeamMatches(id2) : Promise.resolve(null),
    id1 ? getTeamPlayers(id1) : Promise.resolve(null),
    id2 ? getTeamPlayers(id2) : Promise.resolve(null),
  ])
  const val = <T,>(r: PromiseSettledResult<T | null>): T | null => (r.status === 'fulfilled' ? r.value : null)

  /** Active five, richest in games first. The endpoint returns every ex-member too. */
  const roster = (players: Awaited<ReturnType<typeof getTeamPlayers>>) =>
    (players ?? [])
      .filter((p) => p.is_current_team_member)
      .sort((a, b) => (b.games_played ?? 0) - (a.games_played ?? 0))
      .slice(0, 7)
      .map((p) => ({
        accountId: p.account_id ?? null,
        name: p.name ?? null,
        gamesPlayed: p.games_played ?? 0,
        wins: p.wins ?? 0,
      }))

  // A left join yields null for a team the standings have not published yet — an
  // unseeded playoff slot. Normalise so the shape is stable for the client.
  const blank = { id: null, name: null, tag: null, logoUrl: null }
  const side1 = row.team1 ?? blank
  const side2 = row.team2 ?? blank

  return c.json({
    league: { leagueId, name: row.leagueName },
    node: {
      nodeId: row.node.nodeId,
      name: row.node.name,
      nodeGroupName: row.node.nodeGroupName,
      status: row.node.isCompleted ? 'finished' : row.node.hasStarted ? 'live' : 'upcoming',
      bestOf: nodeTypeToBestOf(row.node.nodeType ?? undefined),
      scheduledTime: row.node.scheduledTime,
      seriesId: row.node.seriesId,
      matchIds: row.matchIds ?? [],
    },
    team1: { ...side1, wins: row.node.team1Wins, roster: roster(val(p1)) },
    team2: { ...side2, wins: row.node.team2Wins, roster: roster(val(p2)) },
    ...buildH2H({
      radiantTeamId: id1,
      direTeamId: id2,
      radiantName: side1.name,
      direName: side2.name,
      radiantMatches: val(m1),
      direMatches: val(m2),
    }),
  })
})

// ─── Series ──────────────────────────────────────────────────────────────────

/**
 * A series with a summary of each of its maps. This is what powers the
 * "Game 1 / Game 2 / Game 3" tabs — the whole point of the feature.
 */
archiveRoutes.get('/series/:seriesId', async (c) => {
  const d = requireDb()
  if (!d) return c.json({ error: 'archive_unavailable' }, 503)
  const seriesId = parseId(c.req.param('seriesId'))
  if (seriesId === null) return c.json({ error: 'Invalid seriesId' }, 400)

  const [row] = await d.select().from(seriesTable).where(eq(seriesTable.seriesId, seriesId)).limit(1)
  if (!row) return c.json({ error: 'Series not found' }, 404)

  const games = await d
    .select()
    .from(matches)
    .where(eq(matches.seriesId, seriesId))
    .orderBy(asc(matches.gameInSeries), asc(matches.startTime))

  return c.json({
    series: { ...row, bestOf: seriesTypeToBestOf(row.seriesType ?? undefined) },
    games,
  })
})

/**
 * The series a given match belongs to, resolved from the match itself.
 * Lets MatchPage render the map tabs without the caller knowing the series id.
 */
archiveRoutes.get('/matches/:matchId/series', async (c) => {
  const d = requireDb()
  if (!d) return c.json({ error: 'archive_unavailable' }, 503)
  const matchId = parseId(c.req.param('matchId'))
  if (matchId === null) return c.json({ error: 'Invalid matchId' }, 400)

  const [self] = await d.select().from(matches).where(eq(matches.matchId, matchId)).limit(1)
  if (!self?.seriesId) return c.json({ series: null, games: [] })

  const [row] = await d.select().from(seriesTable).where(eq(seriesTable.seriesId, self.seriesId)).limit(1)
  const games = await d
    .select()
    .from(matches)
    .where(eq(matches.seriesId, self.seriesId))
    .orderBy(asc(matches.gameInSeries), asc(matches.startTime))

  /**
   * Short team tags, joined on the series' own two team ids.
   *
   * Neither Valve's live payload nor the matches row carries one — both stop at the full
   * name — so an event line naming a team had only "Team Liquid" to work with, which is
   * too long to sit beside every hero in a log. `teams.tag` is populated from the
   * tournament's standings, the same place the crests come from.
   */
  const tagIds = [row?.team1Id, row?.team2Id].filter((id): id is number => typeof id === 'number')
  const tagRows = tagIds.length
    ? await d
        .select({ teamId: teams.teamId, tag: teams.tag, name: teams.name })
        .from(teams)
        .where(inArray(teams.teamId, tagIds))
    : []

  // The maps are already in hand, so the series score is settled here rather than trusted
  // from the row: series.team_N_wins is Valve's, on its own sync schedule, and it showed
  // 2-0 on this page while the bracket beside it still said 1-0.
  const bestOf = row ? seriesTypeToBestOf(row.seriesType ?? undefined) : null
  const score = row
    ? resolveSeriesScore({ ...row, bestOf }, tallyFromGames(games))
    : null

  return c.json({
    series: row
      ? {
          ...row,
          bestOf,
          team1Wins: score?.team1Wins ?? row.team1Wins,
          team2Wins: score?.team2Wins ?? row.team2Wins,
          team1Tag: tagRows.find((t) => t.teamId === row.team1Id)?.tag ?? null,
          team2Tag: tagRows.find((t) => t.teamId === row.team2Id)?.tag ?? null,
        }
      : null,
    games,
  })
})

// ─── Matches ─────────────────────────────────────────────────────────────────

/** Archived match list. Default: finished matches, newest first. */
archiveRoutes.get('/matches', async (c) => {
  const d = requireDb()
  if (!d) return c.json({ error: 'archive_unavailable' }, 503)
  const leagueId = c.req.query('leagueId') ? parseId(c.req.query('leagueId')) : null
  const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, 200)
  const status = c.req.query('status') ?? 'finished'

  const statusFilter =
    status === 'live'
      ? eq(matches.ingestStatus, 'live')
      : status === 'all'
        ? undefined
        : inArray(matches.ingestStatus, ['awaiting_parse', 'complete', 'failed'])

  const where = [statusFilter, leagueId !== null ? eq(matches.leagueId, leagueId) : undefined].filter(Boolean)

  const rows = await d
    .select()
    .from(matches)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(matches.startTime), desc(matches.matchId))
    .limit(limit)

  return c.json({ matches: rows })
})

archiveRoutes.get('/matches/:matchId', async (c) => {
  const d = requireDb()
  if (!d) return c.json({ error: 'archive_unavailable' }, 503)
  const matchId = parseId(c.req.param('matchId'))
  if (matchId === null) return c.json({ error: 'Invalid matchId' }, 400)
  const [row] = await d.select().from(matches).where(eq(matches.matchId, matchId)).limit(1)
  if (!row) return c.json({ error: 'Match not archived' }, 404)
  return c.json({ match: row })
})

/**
 * Per-minute series + events, for the charts and the scrubber's event ticks.
 * `sources` tells the UI which minutes came from a parsed replay and which are the
 * 30s live approximation, so it can say so instead of implying equal precision.
 */
archiveRoutes.get('/matches/:matchId/timeline', async (c) => {
  const d = requireDb()
  if (!d) return c.json({ error: 'archive_unavailable' }, 503)
  const matchId = parseId(c.req.param('matchId'))
  if (matchId === null) return c.json({ error: 'Invalid matchId' }, 400)

  const [timeline, events, snapshotBounds] = await Promise.all([
    d.select().from(matchTimeline).where(eq(matchTimeline.matchId, matchId)).orderBy(asc(matchTimeline.minute)),
    d.select().from(matchEvents).where(eq(matchEvents.matchId, matchId)).orderBy(asc(matchEvents.t)),
    d
      .select({
        minT: sql<number>`min(${matchSnapshots.t})`,
        maxT: sql<number>`max(${matchSnapshots.t})`,
        count: sql<number>`count(*)`,
      })
      .from(matchSnapshots)
      .where(eq(matchSnapshots.matchId, matchId)),
  ])

  if (timeline.length === 0 && events.length === 0) {
    return c.json({ error: 'Match not archived' }, 404)
  }

  const bounds = snapshotBounds[0]
  return c.json({
    matchId,
    timeline,
    events,
    // Minutes that have a raw snapshot behind them — only these can be time-travelled to
    // with full detail; the rest render from the derived rows alone.
    snapshots: {
      count: Number(bounds?.count ?? 0),
      minMinute: bounds?.minT != null ? Math.floor(Number(bounds.minT) / 60) : null,
      maxMinute: bounds?.maxT != null ? Math.floor(Number(bounds.maxT) / 60) : null,
    },
    lastMinute: timeline.length > 0 ? timeline[timeline.length - 1].minute : null,
  })
})

/** The minutes for which a full raw snapshot exists (scrubber tick marks). */
archiveRoutes.get('/matches/:matchId/snapshots', async (c) => {
  const d = requireDb()
  if (!d) return c.json({ error: 'archive_unavailable' }, 503)
  const matchId = parseId(c.req.param('matchId'))
  if (matchId === null) return c.json({ error: 'Invalid matchId' }, 400)
  const rows = await d
    .select({ t: matchSnapshots.t, gameState: matchSnapshots.gameState })
    .from(matchSnapshots)
    .where(eq(matchSnapshots.matchId, matchId))
    .orderBy(asc(matchSnapshots.t))
  return c.json({ matchId, snapshots: rows, minutes: [...new Set(rows.map((r) => Math.floor(r.t / 60)))] })
})

/**
 * Time travel. Returns the stored payload in the SAME shape as one element of
 * /api/live/games, which is what lets the whole MatchPage render an archived minute
 * without a single component change.
 *
 * Resolution: the latest snapshot at or before the end of the requested minute; if the
 * match started later than that, the earliest snapshot. Never interpolates — a shown
 * state is always a state that actually occurred.
 */
archiveRoutes.get('/matches/:matchId/at', async (c) => {
  const d = requireDb()
  if (!d) return c.json({ error: 'archive_unavailable' }, 503)
  const matchId = parseId(c.req.param('matchId'))
  if (matchId === null) return c.json({ error: 'Invalid matchId' }, 400)

  const rawMinute = c.req.query('minute')
  const rawT = c.req.query('t')
  let upper: number
  if (rawT !== undefined) {
    const t = Number(rawT)
    if (!Number.isFinite(t) || t < 0) return c.json({ error: 'Invalid t' }, 400)
    upper = Math.floor(t)
  } else {
    const minute = Number(rawMinute)
    if (!Number.isFinite(minute) || minute < 0) return c.json({ error: 'Invalid minute' }, 400)
    upper = Math.floor(minute) * 60 + 59
  }

  const [hit] = await d
    .select()
    .from(matchSnapshots)
    .where(and(eq(matchSnapshots.matchId, matchId), lte(matchSnapshots.t, upper)))
    .orderBy(desc(matchSnapshots.t))
    .limit(1)

  const chosen =
    hit ??
    (
      await d
        .select()
        .from(matchSnapshots)
        .where(eq(matchSnapshots.matchId, matchId))
        .orderBy(asc(matchSnapshots.t))
        .limit(1)
    )[0]

  if (!chosen) {
    // No live recording — rebuild the minute from the per-minute rows and the event log.
    // This is the "machine was off overnight" case, and without it the whole match page
    // renders empty for a match the archive otherwise knows plenty about.
    const rebuilt = await reconstructAt(matchId, upper)
    if (!rebuilt) return c.json({ error: 'No snapshot for this match' }, 404)
    return c.json({
      matchId,
      t: rebuilt.t,
      minute: rebuilt.minute,
      capturedAt: null,
      exact: rebuilt.t <= upper,
      /** No raw snapshot behind this: cooldowns and map positions are absent. */
      reconstructed: true,
      /** Item slots, when present, are the match's final build rather than this minute's. */
      itemsAreFinal: rebuilt.itemsAreFinal,
      /** Assists exist only as a match total, so they are filled at the final minute only. */
      assistsKnown: rebuilt.assistsKnown,
      game: rebuilt.game,
    })
  }

  return c.json({
    matchId,
    t: chosen.t,
    minute: Math.floor(chosen.t / 60),
    capturedAt: chosen.capturedAt,
    // `exact` is false when the requested minute predates the first snapshot, so the UI
    // can flag that it is showing the earliest state rather than the one asked for.
    exact: chosen.t <= upper,
    reconstructed: false,
    game: chosen.payload,
  })
})

/**
 * Head-to-head + recent form for the two teams in a match.
 *
 * Team ids come from the archive row when the match is recorded, and from the live feed
 * otherwise — so this works on a match that started thirty seconds ago as well as on one
 * from last week. Both upstream calls are keyless OpenDota and cached 6h per team.
 */
archiveRoutes.get('/matches/:matchId/h2h', async (c) => {
  const matchId = parseId(c.req.param('matchId'))
  if (matchId === null) return c.json({ error: 'Invalid matchId' }, 400)

  let radiantTeamId: number | null = null
  let direTeamId: number | null = null
  let radiantName: string | null = null
  let direName: string | null = null

  const d = requireDb()
  if (d) {
    const [row] = await d
      .select({
        r: matches.radiantTeamId,
        dire: matches.direTeamId,
        rn: matches.radiantTeamName,
        dn: matches.direTeamName,
      })
      .from(matches)
      .where(eq(matches.matchId, matchId))
      .limit(1)
    radiantTeamId = row?.r ?? null
    direTeamId = row?.dire ?? null
    radiantName = row?.rn ?? null
    direName = row?.dn ?? null
  }

  if (radiantTeamId === null || direTeamId === null) {
    // Not archived (yet) — fall back to the live feed, which is already cached 30s.
    try {
      const live = await getLiveLeagueGames()
      const game = live.result.games?.find((g) => g.match_id === matchId)
      radiantTeamId ??= game?.radiant_team?.team_id ?? null
      direTeamId ??= game?.dire_team?.team_id ?? null
      radiantName ??= game?.radiant_team?.team_name ?? null
      direName ??= game?.dire_team?.team_name ?? null
    } catch {
      /* upstream down — answer with whatever the archive knew */
    }
  }

  if (radiantTeamId === null && direTeamId === null) {
    return c.json({ error: 'Teams unknown for this match' }, 404)
  }

  // allSettled: one team missing from OpenDota must not blank the other's form.
  const [rRes, dRes] = await Promise.allSettled([
    radiantTeamId ? getTeamMatches(radiantTeamId) : Promise.resolve(null),
    direTeamId ? getTeamMatches(direTeamId) : Promise.resolve(null),
  ])
  const rMatches = rRes.status === 'fulfilled' ? rRes.value : null
  const dMatches = dRes.status === 'fulfilled' ? dRes.value : null

  return c.json(
    buildH2H({ radiantTeamId, direTeamId, radiantName, direName, radiantMatches: rMatches, direMatches: dMatches }),
  )
})

archiveRoutes.get('/matches/:matchId/analysis', async (c) => {
  const d = requireDb()
  if (!d) return c.json({ error: 'archive_unavailable' }, 503)
  const matchId = parseId(c.req.param('matchId'))
  if (matchId === null) return c.json({ error: 'Invalid matchId' }, 400)
  const [row] = await d.select().from(matchAnalysis).where(eq(matchAnalysis.matchId, matchId)).limit(1)
  if (!row) return c.json({ error: 'Analysis not computed yet' }, 404)
  return c.json({ matchId, computedAt: row.computedAt, version: row.version, ...(row.data as object) })
})

// ─── Health ──────────────────────────────────────────────────────────────────

archiveRoutes.get('/archive/status', async (c) => {
  const d = requireDb()
  // Which leagues are being recorded, so the UI can explain an empty match page instead
  // of rendering nothing at all.
  const tracked = [...trackedLeagueIds]
  if (!d) return c.json({ configured: false, trackedLeagueIds: tracked }, 200)
  try {
    const trackedNames =
      tracked.length > 0
        ? await d
            .select({ leagueId: leagues.leagueId, name: leagues.name })
            .from(leagues)
            .where(inArray(leagues.leagueId, tracked))
        : []
    // ::int on every count. Postgres returns count(*) as bigint, which postgres-js hands
    // back as a STRING — so `sql<number>` was an assertion the runtime never honoured, and
    // the client had already been written against the truth (`counts?: Record<string, string>`).
    // Two type declarations describing the same field differently, both compiling.
    const [counts] = await d
      .select({
        matches: sql<number>`(select count(*)::int from ${matches})`,
        snapshots: sql<number>`(select count(*)::int from ${matchSnapshots})`,
        minutes: sql<number>`(select count(*)::int from ${matchTimeline})`,
        events: sql<number>`(select count(*)::int from ${matchEvents})`,
        seriesCount: sql<number>`(select count(*)::int from ${seriesTable})`,
        nodes: sql<number>`(select count(*)::int from ${bracketNodes})`,
      })
      .from(sql`(select 1) as _`)
    return c.json({ configured: true, reachable: true, counts, trackedLeagueIds: tracked, trackedLeagues: trackedNames })
  } catch (err) {
    logger.error({ err: briefError(err) }, 'archive: status query failed')
    return c.json({ configured: true, reachable: false, trackedLeagueIds: tracked }, 503)
  }
})

export default archiveRoutes
