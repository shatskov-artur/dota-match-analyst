import { and, eq, isNull, ne, or, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  leagues,
  teams,
  leagueStandings,
  bracketNodes,
  series as seriesTable,
  matches,
} from '../../db/schema.js'
import { getLeagueData } from '../valveApi.js'
import { getLeagueInfo, getLeagueMatches, type LeagueMatch } from '../openDotaApi.js'
import {
  flattenNodeGroups,
  flattenNodes,
  extractNodeMatchIds,
  type LeagueData,
  type TeamStanding,
} from '../../schemas/leagueData.js'
import { trackedLeagueIds } from '../../env.js'
import { shouldArchiveLeague } from './archivePolicy.js'
import { logger, briefError } from '../../logger.js'

// Mirrors GetLeagueData into the archive: bracket, schedule, standings, team names.
//
// Runs on its own 5-minute tick. Everything is an upsert keyed on Valve's own ids, so
// a tick that lands mid-series is idempotent and a missed tick costs nothing.
//
// TI 2026 specifics that shaped this (verified 2026-08-12 against league 19719):
//  - node_groups nest two levels deep (phase group → "Swiss"/"Playoff" → nodes)
//  - series_infos is EMPTY; per-series match ids live in nodes[].matches[]
//  - team_standings is the only keyless source of team NAMES and logo URLs

export interface SyncResult {
  leagueId: number
  nodes: number
  seriesRows: number
  matchStubs: number
  teams: number
  standings: number
}

/** Collect every distinct team seen in standings across all groups. */
function collectTeams(data: LeagueData): Map<number, TeamStanding> {
  const out = new Map<number, TeamStanding>()
  for (const g of flattenNodeGroups(data.node_groups)) {
    for (const s of g.team_standings ?? []) {
      if (typeof s.team_id === 'number' && s.team_id > 0) {
        // Later groups (playoff) win over earlier ones — same team, fresher record.
        out.set(s.team_id, { ...(out.get(s.team_id) ?? {}), ...s })
      }
    }
  }
  return out
}

/** Slack on "current" so a tournament is not dropped the morning after its final. */
const STALE_LEAGUE_DAYS = 14

/**
 * Is this league a going concern, or an abandoned bracket template?
 *
 * Valve keeps league records forever, and league ids get reused by community organisers.
 * Underdogs Amateur League (12572) is the case that prompted this: it has a full 105-node
 * bracket with real team names, all of it from a season that ended in February 2021 —
 * every node scheduled_time 0, last activity November 2020 — yet matches are played under
 * that id today. Syncing it put a five-year-old ghost bracket in the navigation next to
 * The International, offering "upcoming" matches that will never be played.
 *
 * Explicitly tracked leagues always pass: the operator asked for them by id.
 */
export function isLeagueCurrent(
  info: { end_timestamp?: number; most_recent_activity?: number },
  nodes: Array<{ scheduled_time?: number }>,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const cutoff = nowSeconds - STALE_LEAGUE_DAYS * 86_400
  if ((info.end_timestamp ?? 0) > cutoff) return true
  if ((info.most_recent_activity ?? 0) > cutoff) return true
  // A published future fixture is proof of life even when the dates say otherwise.
  return nodes.some((n) => (n.scheduled_time ?? 0) > nowSeconds)
}

/**
 * Forget a league we should not have stored. Schedule-level rows only — archived matches
 * and their snapshots are real recordings and are never touched here.
 */
async function purgeLeague(leagueId: number): Promise<void> {
  if (!db) return
  await db.delete(bracketNodes).where(eq(bracketNodes.leagueId, leagueId))
  await db.delete(leagueStandings).where(eq(leagueStandings.leagueId, leagueId))
  await db.delete(leagues).where(eq(leagues.leagueId, leagueId))
}

export async function syncLeague(leagueId: number): Promise<SyncResult | null> {
  if (!db) return null
  const data = await getLeagueData(leagueId)
  if (!data) {
    logger.warn({ leagueId }, 'tournament sync: no league data (upstream miss) — keeping what is stored')
    return null
  }

  const info = data.info ?? {}

  if (!trackedLeagueIds.has(leagueId) && !isLeagueCurrent(info, flattenNodes(data.node_groups))) {
    // Self-healing: if an earlier tick stored it before this check existed, drop it.
    await purgeLeague(leagueId)
    logger.info(
      { leagueId, name: info.name, endTimestamp: info.end_timestamp },
      'tournament sync: skipping stale league',
    )
    return null
  }
  const result: SyncResult = { leagueId, nodes: 0, seriesRows: 0, matchStubs: 0, teams: 0, standings: 0 }

  // ─── League ────────────────────────────────────────────────────────────────
  //
  // OpenDota's tier name, alongside Valve's numeric one. Free: getLeagueInfo is the same
  // 6h-cached call the archive policy already made to decide whether to record this league,
  // so this is a cache read, not a second request. Never let a transient failure reach the
  // upsert — a null here would blank a known tier (the coalesce below is the second guard).
  const odTier = await getLeagueInfo(leagueId)
    .then((i) => i?.tier ?? null)
    .catch(() => null)

  await db
    .insert(leagues)
    .values({
      leagueId,
      name: info.name ?? null,
      tier: info.tier ?? null,
      odTier,
      region: info.region ?? null,
      startTimestamp: info.start_timestamp ?? null,
      endTimestamp: info.end_timestamp ?? null,
      totalPrizePool: data.prize_pool?.total_prize_pool ?? null,
      description: info.description ?? null,
      streams: data.streams ?? null,
      raw: info,
      lastSyncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: leagues.leagueId,
      set: {
        name: sql`excluded.name`,
        tier: sql`excluded.tier`,
        // coalesce, unlike its neighbours: OpenDota being unreachable for one tick must not
        // erase a tier the app already knew, or the home-page filter would drop the
        // tournament into "Other" until the next successful lookup.
        odTier: sql`coalesce(excluded.od_tier, ${leagues.odTier})`,
        region: sql`excluded.region`,
        startTimestamp: sql`excluded.start_timestamp`,
        endTimestamp: sql`excluded.end_timestamp`,
        totalPrizePool: sql`excluded.total_prize_pool`,
        description: sql`excluded.description`,
        streams: sql`excluded.streams`,
        raw: sql`excluded.raw`,
        lastSyncedAt: sql`excluded.last_synced_at`,
      },
    })

  // ─── Teams + standings ─────────────────────────────────────────────────────
  const teamMap = collectTeams(data)
  if (teamMap.size > 0) {
    await db
      .insert(teams)
      .values(
        [...teamMap.entries()].map(([teamId, s]) => ({
          teamId,
          name: s.team_name ?? null,
          tag: s.team_tag ?? null,
          abbreviation: s.team_abbreviation ?? null,
          // team_logo_url is already a CDN URL. The sibling `team_logo` ugcid is
          // deliberately dropped — it exceeds MAX_SAFE_INTEGER and JSON.parse has
          // already corrupted it by the time we see it (CLAUDE.md pitfall).
          logoUrl: s.team_logo_url ?? null,
          isPro: s.is_pro ?? null,
          updatedAt: new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: teams.teamId,
        set: {
          name: sql`coalesce(excluded.name, ${teams.name})`,
          tag: sql`coalesce(excluded.tag, ${teams.tag})`,
          abbreviation: sql`coalesce(excluded.abbreviation, ${teams.abbreviation})`,
          logoUrl: sql`coalesce(excluded.logo_url, ${teams.logoUrl})`,
          isPro: sql`excluded.is_pro`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
    result.teams = teamMap.size
  }

  // De-duplicated by the composite key. Valve pads a group's standings with empty
  // slots (team_id 0) for seats not yet decided — the Elimination Round carries six of
  // them — and Postgres rejects an INSERT whose ON CONFLICT target repeats within one
  // statement ("cannot affect row a second time"). Drop the placeholders, keep the last
  // occurrence of any genuine repeat.
  const standingByKey = new Map<string, typeof leagueStandings.$inferInsert>()
  for (const g of flattenNodeGroups(data.node_groups)) {
    if (typeof g.node_group_id !== 'number') continue
    for (const s of g.team_standings ?? []) {
      if (typeof s.team_id !== 'number' || s.team_id <= 0) continue
      standingByKey.set(`${g.node_group_id}:${s.team_id}`, {
        leagueId,
        nodeGroupId: g.node_group_id,
        teamId: s.team_id,
        standing: s.standing ?? null,
        wins: s.wins ?? null,
        losses: s.losses ?? null,
        score: s.score === undefined ? null : String(s.score),
        updatedAt: new Date(),
      })
    }
  }
  const standingRows = [...standingByKey.values()]
  if (standingRows.length > 0) {
    await db
      .insert(leagueStandings)
      .values(standingRows)
      .onConflictDoUpdate({
        target: [leagueStandings.leagueId, leagueStandings.nodeGroupId, leagueStandings.teamId],
        set: {
          standing: sql`excluded.standing`,
          wins: sql`excluded.wins`,
          losses: sql`excluded.losses`,
          score: sql`excluded.score`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
    result.standings = standingRows.length
  }

  // ─── Bracket nodes ─────────────────────────────────────────────────────────
  // node_id is league-local and must be unique, but de-duplicate anyway: the same
  // guard as standings, since a repeat inside one statement is a hard Postgres error.
  const nodeById = new Map<number, ReturnType<typeof flattenNodes>[number]>()
  for (const n of flattenNodes(data.node_groups)) {
    if (typeof n.node_id === 'number') nodeById.set(n.node_id, n)
  }
  const nodes = [...nodeById.values()]
  if (nodes.length > 0) {
    await db
      .insert(bracketNodes)
      .values(
        nodes.map((n) => ({
          leagueId,
          nodeId: n.node_id as number,
          nodeGroupId: n.nodeGroupId ?? null,
          nodeGroupName: n.nodeGroupName ?? null,
          parentNodeGroupId: n.parentNodeGroupId ?? null,
          phase: n.phase ?? null,
          name: n.name ?? null,
          team1Id: n.team_id_1 || null,
          team2Id: n.team_id_2 || null,
          seriesId: n.series_id || null,
          nodeType: n.node_type ?? null,
          scheduledTime: n.scheduled_time || null,
          actualTime: n.actual_time || null,
          team1Wins: n.team_1_wins ?? null,
          team2Wins: n.team_2_wins ?? null,
          hasStarted: n.has_started ?? null,
          isCompleted: n.is_completed ?? null,
          winningNodeId: n.winning_node_id ?? null,
          losingNodeId: n.losing_node_id ?? null,
          incomingNodeId1: n.incoming_node_id_1 ?? null,
          incomingNodeId2: n.incoming_node_id_2 ?? null,
          streamIds: n.stream_ids ?? null,
          updatedAt: new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: [bracketNodes.leagueId, bracketNodes.nodeId],
        set: {
          nodeGroupId: sql`excluded.node_group_id`,
          nodeGroupName: sql`excluded.node_group_name`,
          parentNodeGroupId: sql`excluded.parent_node_group_id`,
          phase: sql`excluded.phase`,
          name: sql`excluded.name`,
          team1Id: sql`excluded.team_1_id`,
          team2Id: sql`excluded.team_2_id`,
          seriesId: sql`excluded.series_id`,
          nodeType: sql`excluded.node_type`,
          scheduledTime: sql`excluded.scheduled_time`,
          actualTime: sql`excluded.actual_time`,
          team1Wins: sql`excluded.team_1_wins`,
          team2Wins: sql`excluded.team_2_wins`,
          hasStarted: sql`excluded.has_started`,
          isCompleted: sql`excluded.is_completed`,
          winningNodeId: sql`excluded.winning_node_id`,
          losingNodeId: sql`excluded.losing_node_id`,
          incomingNodeId1: sql`excluded.incoming_node_id_1`,
          incomingNodeId2: sql`excluded.incoming_node_id_2`,
          streamIds: sql`excluded.stream_ids`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
    result.nodes = nodes.length
  }

  // ─── Series ────────────────────────────────────────────────────────────────
  // Two independent sources, merged by series_id. series_infos is authoritative for
  // match order when present; on TI it is empty, so the node's own matches[] carries it.
  type SeriesRow = typeof seriesTable.$inferInsert
  const bySeries = new Map<number, SeriesRow>()

  for (const s of data.series_infos ?? []) {
    if (typeof s.series_id !== 'number' || s.series_id <= 0) continue
    bySeries.set(s.series_id, {
      seriesId: s.series_id,
      leagueId,
      seriesType: s.series_type ?? null,
      team1Id: s.team_id_1 || null,
      team2Id: s.team_id_2 || null,
      startTime: s.start_time || null,
      matchIds: s.match_ids ?? [],
      updatedAt: new Date(),
    })
  }

  for (const n of nodes) {
    const seriesId = n.series_id
    if (typeof seriesId !== 'number' || seriesId <= 0) continue
    const nodeMatchIds = extractNodeMatchIds(n.matches)
    const prev = bySeries.get(seriesId)

    /**
     * One team order for the whole row: the node's.
     *
     * The id used to come from series_infos while the name was always looked up from the
     * NODE's id, and the two sources do not agree on which team is "1". For Liquid vs Iron
     * Wing that stored team_1_id = Liquid (2163) beside team_1_name = "Iron Wing".
     *
     * The names were the visible half, but the wins were the dangerous half: team_1_wins
     * comes from the node too, so a row whose ids were flipped relative to the node
     * credited the score to the opposing team. Anything reading the series by id — the
     * match header's series score does exactly that — would have shown it backwards as
     * soon as the series stopped being level.
     *
     * So the node decides the pair, and series_infos fills in only what the node lacks.
     * ids, names and wins then all describe the same two teams in the same order.
     */
    const team1Id = n.team_id_1 ?? prev?.team1Id ?? null
    const team2Id = n.team_id_2 ?? prev?.team2Id ?? null

    bySeries.set(seriesId, {
      seriesId,
      leagueId,
      nodeId: n.node_id ?? null,
      // node_type and series_type use different encodings; keep series_type when
      // series_infos supplied one and leave it null otherwise rather than mixing them.
      seriesType: prev?.seriesType ?? null,
      team1Id,
      team2Id,
      team1Name: teamMap.get(team1Id ?? -1)?.team_name ?? null,
      team2Name: teamMap.get(team2Id ?? -1)?.team_name ?? null,
      startTime: prev?.startTime ?? n.actual_time ?? null,
      scheduledTime: n.scheduled_time || null,
      team1Wins: n.team_1_wins ?? null,
      team2Wins: n.team_2_wins ?? null,
      // Prefer whichever source knows about more games.
      matchIds:
        (prev?.matchIds?.length ?? 0) >= nodeMatchIds.length ? prev?.matchIds ?? [] : nodeMatchIds,
      updatedAt: new Date(),
    })
  }

  if (bySeries.size > 0) {
    await db
      .insert(seriesTable)
      .values([...bySeries.values()])
      .onConflictDoUpdate({
        target: seriesTable.seriesId,
        set: {
          leagueId: sql`excluded.league_id`,
          nodeId: sql`coalesce(excluded.node_id, ${seriesTable.nodeId})`,
          seriesType: sql`coalesce(excluded.series_type, ${seriesTable.seriesType})`,
          team1Id: sql`coalesce(excluded.team_1_id, ${seriesTable.team1Id})`,
          team2Id: sql`coalesce(excluded.team_2_id, ${seriesTable.team2Id})`,
          team1Name: sql`coalesce(excluded.team_1_name, ${seriesTable.team1Name})`,
          team2Name: sql`coalesce(excluded.team_2_name, ${seriesTable.team2Name})`,
          startTime: sql`coalesce(excluded.start_time, ${seriesTable.startTime})`,
          scheduledTime: sql`coalesce(excluded.scheduled_time, ${seriesTable.scheduledTime})`,
          team1Wins: sql`excluded.team_1_wins`,
          team2Wins: sql`excluded.team_2_wins`,
          // Whichever source knows about more maps wins — the same guard discoverLeagueMatches
          // uses on the very same column. Without it this path could SHRINK the list: Valve
          // publishes match ids late, so a bracket sync running while it still shows two maps
          // overwrote the three OpenDota had already found. It usually self-healed on the next
          // discovery pass in the same tick, but not while OpenDota was unreachable — and a
          // shrunken match_ids feeds `played` in the schedule's status logic.
          matchIds: sql`case
            when jsonb_array_length(excluded.match_ids)
               >= jsonb_array_length(coalesce(${seriesTable.matchIds}, '[]'::jsonb))
            then excluded.match_ids else ${seriesTable.matchIds} end`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
    result.seriesRows = bySeries.size
  }

  // ─── Match stubs ───────────────────────────────────────────────────────────
  // Rows for games Valve knows about but our sampler may never have seen (e.g. the
  // machine was off). postMatchBackfill picks these up and fills them from OpenDota.
  type MatchRow = typeof matches.$inferInsert
  // Keyed by match_id: the same id must not appear twice in one statement even if two
  // series somehow claim it.
  const stubById = new Map<number, MatchRow>()
  for (const s of bySeries.values()) {
    const ids = s.matchIds ?? []
    ids.forEach((matchId, idx) => {
      if (!Number.isFinite(matchId) || matchId <= 0) return
      stubById.set(matchId, {
        matchId,
        seriesId: s.seriesId,
        leagueId,
        leagueName: info.name ?? null,
        gameInSeries: idx + 1,
        ingestStatus: 'awaiting_parse',
      })
    })
  }
  // ARCHIVED LEAGUES ONLY. Schedules are synced for every live league so "what's on this
  // week" covers the scene, but a match row is a unit of WORK: it goes straight into the
  // backfill queue and costs an OpenDota fetch. Community leagues run continuously and
  // publish their whole history here — 江雪杯 alone carries 4,786 matches — so stubbing
  // everything queued 21,000 fetches and buried The International behind them.
  //
  // Now asks the archive policy rather than the id list directly: with tier-based recording
  // the list is empty by default, and reading it literally would have stopped creating match
  // rows for the very tournaments being recorded.
  const stubs = (await shouldArchiveLeague(leagueId)) ? [...stubById.values()] : []
  if (stubs.length > 0) {
    await db
      .insert(matches)
      .values(stubs)
      .onConflictDoUpdate({
        target: matches.matchId,
        set: {
          // Only the series wiring. Never touch ingestStatus/duration/score here —
          // a live match is mid-flight and the sampler owns those columns.
          seriesId: sql`coalesce(excluded.series_id, ${matches.seriesId})`,
          leagueId: sql`coalesce(excluded.league_id, ${matches.leagueId})`,
          leagueName: sql`coalesce(excluded.league_name, ${matches.leagueName})`,
          gameInSeries: sql`coalesce(excluded.game_in_series, ${matches.gameInSeries})`,
        },
      })
    result.matchStubs = stubs.length
  }

  return result
}

/**
 * Upper bound on how many leagues one sync tick will walk.
 *
 * Schedules are synced for tracked leagues AND for whatever is live right now, so the
 * app can answer "what is on this week" beyond the one tournament being archived. Each
 * league is a single keyless call cached 5 minutes, but the set has to stay bounded —
 * a quiet Tuesday has a dozen active leagues, a major weekend can have far more.
 */
export const MAX_LEAGUES_PER_SYNC = 24

/**
 * Sync bracket, schedule and standings for the given leagues.
 *
 * Note this is schedule-level only. Whether a league's MATCHES get archived minute by
 * minute is a separate decision governed by TRACKED_LEAGUE_IDS — syncing a schedule is
 * one cheap call, recording a match is megabytes per game.
 */
/**
 * Priority under the cap. Lower wins.
 *
 *   0  explicitly tracked — the operator named it, it outranks everything
 *   1  an active tournament — running now or finished within the grace window
 *   2  merely live this minute — a ladder game that happens to be on
 *
 * The middle rank is the whole point of having three. With two ranks, a busy evening of
 * amateur games could push The International past the cap on a day when it was between
 * matches — which is exactly the window in which its next fixtures get published.
 */
function syncRank(id: number, ofInterest: ReadonlySet<number>): 0 | 1 | 2 {
  if (trackedLeagueIds.has(id)) return 0
  if (ofInterest.has(id)) return 1
  return 2
}

export async function syncLeagues(
  leagueIds: Iterable<number>,
  ofInterest: ReadonlySet<number> = new Set(),
): Promise<SyncResult[]> {
  if (!db) return []
  const ids = [...new Set(leagueIds)].filter((id) => Number.isFinite(id) && id > 0)
  if (ids.length === 0) return []

  ids.sort((a, b) => syncRank(a, ofInterest) - syncRank(b, ofInterest))
  const capped = ids.slice(0, MAX_LEAGUES_PER_SYNC)
  if (capped.length < ids.length) {
    logger.info({ synced: capped.length, skipped: ids.length - capped.length }, 'tournament sync: league cap reached')
  }

  const out: SyncResult[] = []
  for (const leagueId of capped) {
    try {
      const r = await syncLeague(leagueId)
      if (r) out.push(r)
    } catch (err) {
      logger.error({ leagueId, err: briefError(err) }, 'tournament sync failed')
    }
  }
  return out
}

/** Sync every tracked league. */
export function syncTrackedLeagues(): Promise<SyncResult[]> {
  return syncLeagues(trackedLeagueIds)
}

// ─── Match discovery, independent of Valve ───────────────────────────────────

export interface DiscoveryResult {
  leagueId: number
  matchStubs: number
  seriesRows: number
}

/**
 * Turn OpenDota's flat league match list into match stubs and series rows.
 *
 * Separated from the write so the ordering rules can be tested without a database, and
 * they are the part worth testing: `game_in_series` is a running count per series over
 * rows sorted oldest first, which is what makes the Game 1 / Game 2 / Game 3 tabs come
 * out in the order the maps were actually played.
 */
export function groupLeagueMatches(
  leagueId: number,
  rows: LeagueMatch[],
): { stubs: Array<typeof matches.$inferInsert>; seriesRows: Array<typeof seriesTable.$inferInsert> } {
  const stubById = new Map<number, typeof matches.$inferInsert>()
  const seriesById = new Map<number, typeof seriesTable.$inferInsert>()
  const gamesSoFar = new Map<number, number>()

  // Do not trust the upstream order: a single out-of-order row would renumber a series.
  const ordered = [...rows].sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0) || a.match_id - b.match_id)

  for (const m of ordered) {
    if (!Number.isFinite(m.match_id) || m.match_id <= 0) continue
    const seriesId = m.series_id && m.series_id > 0 ? m.series_id : null
    let gameInSeries: number | null = null

    if (seriesId !== null) {
      gameInSeries = (gamesSoFar.get(seriesId) ?? 0) + 1
      gamesSoFar.set(seriesId, gameInSeries)
      const prev = seriesById.get(seriesId)
      seriesById.set(seriesId, {
        seriesId,
        leagueId,
        seriesType: prev?.seriesType ?? m.series_type ?? null,
        team1Id: prev?.team1Id ?? m.radiant_team_id ?? null,
        team2Id: prev?.team2Id ?? m.dire_team_id ?? null,
        startTime: prev?.startTime ?? m.start_time ?? null,
        matchIds: [...(prev?.matchIds ?? []), m.match_id],
        updatedAt: new Date(),
      })
    }

    stubById.set(m.match_id, {
      matchId: m.match_id,
      leagueId,
      seriesId,
      gameInSeries,
      ingestStatus: 'awaiting_parse',
    })
  }

  return { stubs: [...stubById.values()], seriesRows: [...seriesById.values()] }
}

/**
 * Find matches a league has played, without asking Valve.
 *
 * The bracket sync above learns about a game only from `nodes[].matches[]`, which Valve
 * fills at its own pace and which is empty for a tournament that has not started. That
 * makes it a single point of failure for the one scenario that matters most: the machine
 * was off all night, so the live sampler never saw the games either, and nothing in the
 * archive knows they exist. Backfill can only fill in rows that are already there.
 *
 * OpenDota's league match list is the second, unrelated source. It carries `series_id`
 * and `series_type`, which is everything the Game 1 / Game 2 / Game 3 tabs need, so the
 * series survives even if Valve never publishes a single match id.
 *
 * Never touches `ingest_status` on an existing row — a live match is mid-flight and the
 * sampler owns that column.
 */
export async function discoverLeagueMatches(leagueId: number): Promise<DiscoveryResult | null> {
  if (!db) return null
  const rows = await getLeagueMatches(leagueId)
  if (!rows || rows.length === 0) return null

  const { stubs, seriesRows } = groupLeagueMatches(leagueId, rows)
  if (seriesRows.length > 0) {
    await db
      .insert(seriesTable)
      .values(seriesRows)
      .onConflictDoUpdate({
        target: seriesTable.seriesId,
        set: {
          leagueId: sql`excluded.league_id`,
          // Valve's node encoding and OpenDota's series_type are different scales, but
          // both land here already normalised by their own reader, so first writer wins.
          seriesType: sql`coalesce(${seriesTable.seriesType}, excluded.series_type)`,
          team1Id: sql`coalesce(${seriesTable.team1Id}, excluded.team_1_id)`,
          team2Id: sql`coalesce(${seriesTable.team2Id}, excluded.team_2_id)`,
          startTime: sql`coalesce(${seriesTable.startTime}, excluded.start_time)`,
          // Whichever source knows about more maps wins; a half-published series must
          // not overwrite a complete one.
          matchIds: sql`case
            when jsonb_array_length(excluded.match_ids)
               >= jsonb_array_length(coalesce(${seriesTable.matchIds}, '[]'::jsonb))
            then excluded.match_ids else ${seriesTable.matchIds} end`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
  }

  if (stubs.length > 0) {
    await db
      .insert(matches)
      .values(stubs)
      .onConflictDoUpdate({
        target: matches.matchId,
        set: {
          seriesId: sql`coalesce(excluded.series_id, ${matches.seriesId})`,
          leagueId: sql`coalesce(excluded.league_id, ${matches.leagueId})`,
          gameInSeries: sql`coalesce(excluded.game_in_series, ${matches.gameInSeries})`,
        },
      })
  }

  return { leagueId, matchStubs: stubs.length, seriesRows: seriesRows.length }
}

/**
 * Discover matches for every tracked league.
 *
 * Tracked only: this exists so the tournament being archived cannot lose games, and
 * stubbing every match of every live amateur league would hand the backfill queue work
 * nobody asked for.
 */
export async function discoverTrackedMatches(extraLeagueIds: readonly number[] = []): Promise<DiscoveryResult[]> {
  const out: DiscoveryResult[] = []
  // The explicit list plus whatever the archive policy qualified by tier — the caller
  // resolves the second part, because only it knows which leagues are live right now.
  for (const leagueId of new Set([...trackedLeagueIds, ...extraLeagueIds])) {
    try {
      const r = await discoverLeagueMatches(leagueId)
      if (r) out.push(r)
    } catch (err) {
      logger.error({ leagueId, err: briefError(err) }, 'match discovery failed')
    }
  }
  return out
}

/**
 * Attach a live match to the series it belongs to when Valve has not said so yet.
 *
 * Valve publishes a series long before it publishes the match id of the map being played
 * on it — `series_infos[].match_ids` and `nodes[].matches[]` both fill in minutes late, and
 * for TI 2026 sometimes only once the map is over. Until then the match row exists, is
 * being snapshotted, and has `series_id NULL`, which makes it invisible to everything that
 * reaches a match through its series: the map tabs on both games, the series score, and
 * /series/:id. In practice that meant a game 2 that nobody could navigate to while its
 * draft — the one part of a match that cannot be watched afterwards — was happening.
 *
 * The link is recoverable without guessing: a series names its two teams and its league,
 * and so does the live match. Sides swap between maps, so the pair is compared unordered.
 *
 * The rule is one candidate or nothing. Two teams meet more than once in a tournament —
 * a Swiss round and then the playoff — so candidates are first narrowed to series whose
 * bracket node is not yet completed, which is a fact rather than a preference. If that
 * still leaves more than one, the match is left alone: a wrong link would write a map into
 * someone else's series, and Valve's own value overwrites ours as soon as it arrives.
 */
export async function linkOrphanLiveMatches(): Promise<number> {
  if (!db) return 0

  const orphans = await db
    .select({
      matchId: matches.matchId,
      leagueId: matches.leagueId,
      radiantTeamId: matches.radiantTeamId,
      direTeamId: matches.direTeamId,
    })
    .from(matches)
    .where(and(isNull(matches.seriesId), eq(matches.ingestStatus, 'live')))
  if (orphans.length === 0) return 0

  let linked = 0
  for (const m of orphans) {
    if (!m.leagueId || !m.radiantTeamId || !m.direTeamId) continue

    const candidates = await db
      .select({
        seriesId: seriesTable.seriesId,
        nodeId: seriesTable.nodeId,
        isCompleted: bracketNodes.isCompleted,
      })
      .from(seriesTable)
      .leftJoin(
        bracketNodes,
        and(eq(bracketNodes.leagueId, seriesTable.leagueId), eq(bracketNodes.nodeId, seriesTable.nodeId)),
      )
      .where(
        and(
          eq(seriesTable.leagueId, m.leagueId),
          or(
            and(eq(seriesTable.team1Id, m.radiantTeamId), eq(seriesTable.team2Id, m.direTeamId)),
            and(eq(seriesTable.team1Id, m.direTeamId), eq(seriesTable.team2Id, m.radiantTeamId)),
          ),
        ),
      )

    // A completed node cannot be hosting a game that is being played right now.
    const open = candidates.filter((c) => c.isCompleted !== true)
    const pick = open.length === 1 ? open[0] : null
    if (!pick) {
      if (candidates.length > 0) {
        logger.debug(
          { matchId: m.matchId, candidates: candidates.length, open: open.length },
          'archive: series link ambiguous, leaving match unlinked',
        )
      }
      continue
    }

    // Map order: however many maps of this series are already recorded, this is the next.
    const [{ played } = { played: 0 }] = await db
      .select({ played: sql<number>`count(*)::int` })
      .from(matches)
      .where(and(eq(matches.seriesId, pick.seriesId), ne(matches.matchId, m.matchId)))

    await db
      .update(matches)
      .set({ seriesId: pick.seriesId, gameInSeries: played + 1 })
      .where(and(eq(matches.matchId, m.matchId), isNull(matches.seriesId)))
    linked++
    logger.info(
      { matchId: m.matchId, seriesId: pick.seriesId, gameInSeries: played + 1 },
      'archive: linked live match to its series',
    )
  }
  return linked
}
