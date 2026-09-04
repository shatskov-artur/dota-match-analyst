import {
  pgTable,
  bigint,
  bigserial,
  integer,
  smallint,
  real,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// v2.0 tournament archive.
//
// Design notes:
//  - Dota match ids are ~9e9, past int4 but far below Number.MAX_SAFE_INTEGER, so
//    every id is bigint with mode:'number'. NEVER store a Valve `team_logo` ugcid
//    here — those DO exceed MAX_SAFE_INTEGER and JSON.parse corrupts them before we
//    ever see the value (CLAUDE.md pitfall). Logos are stored as resolved URLs.
//  - `t` is game seconds (scoreboard.duration), never wall-clock. Valve's live feed
//    runs ~2 minutes behind broadcast, so wall-clock would not line up across sources.
//  - Every derived row carries `source`: 'live' (our 30s sampler) or 'opendota'
//    (post-match parsed replay). OpenDota wins on conflict — it has true per-minute
//    resolution while the sampler only approximates it.

export const sourceLive = 'live'
export const sourceOpenDota = 'opendota'

// ─── Tournament structure ────────────────────────────────────────────────────

export const leagues = pgTable('leagues', {
  leagueId: bigint('league_id', { mode: 'number' }).primaryKey(),
  name: text('name'),
  /** Valve's own numeric tier from GetLeagueData. Opaque — kept as sent. */
  tier: integer('tier'),
  /**
   * OpenDota's tier NAME: 'premium' | 'professional' | 'amateur' | 'excluded'.
   *
   * A separate column rather than a translation of the one above, because the two scales
   * are not the same thing and neither is derivable from the other. This is the one the
   * archive policy already decides recording by, and the one a reader recognises — so it is
   * also what the tier filter on the home page is built from.
   */
  odTier: text('od_tier'),
  region: integer('region'),
  startTimestamp: integer('start_timestamp'),
  endTimestamp: integer('end_timestamp'),
  totalPrizePool: bigint('total_prize_pool', { mode: 'number' }),
  description: text('description'),
  /** GetLeagueData `streams[]` — twitch/vod urls per language. */
  streams: jsonb('streams'),
  /** Whole `info` block from GetLeagueData — undocumented endpoint, keep the original. */
  raw: jsonb('raw'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).defaultNow(),
})

/**
 * Teams, harvested from GetLeagueData's `team_standings[]`. That block is the only
 * keyless place that carries a team NAME and a ready-made logo URL next to the id —
 * nodes[] only reference `team_id_1` / `team_id_2`, so without this an upcoming match
 * would render as "9247354 vs 10150538".
 */
export const teams = pgTable('teams', {
  teamId: bigint('team_id', { mode: 'number' }).primaryKey(),
  name: text('name'),
  tag: text('tag'),
  abbreviation: text('abbreviation'),
  /** Already a URL in team_standings — never the raw ugcid (JSON.parse corrupts those). */
  logoUrl: text('logo_url'),
  isPro: boolean('is_pro'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

/** Per-group standings table (Swiss wins/losses, playoff seeding). */
export const leagueStandings = pgTable(
  'league_standings',
  {
    leagueId: bigint('league_id', { mode: 'number' }).notNull(),
    nodeGroupId: integer('node_group_id').notNull(),
    teamId: bigint('team_id', { mode: 'number' }).notNull(),
    standing: integer('standing'),
    wins: integer('wins'),
    losses: integer('losses'),
    score: text('score'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.leagueId, t.nodeGroupId, t.teamId] }),
    index('league_standings_league_idx').on(t.leagueId),
  ],
)

/**
 * The bracket graph. `node_id` is local to a league, hence the composite key.
 * Populated from GetLeagueData → node_groups[] → nodes[]. Some international
 * tournaments leave node_groups empty and only fill series_infos — in that case
 * this table stays empty and the schedule falls back to `series`.
 */
export const bracketNodes = pgTable(
  'bracket_nodes',
  {
    leagueId: bigint('league_id', { mode: 'number' }).notNull(),
    nodeId: integer('node_id').notNull(),
    nodeGroupId: integer('node_group_id'),
    nodeGroupName: text('node_group_name'),
    parentNodeGroupId: integer('parent_node_group_id'),
    phase: integer('phase'),
    name: text('name'),
    team1Id: bigint('team_1_id', { mode: 'number' }),
    team2Id: bigint('team_2_id', { mode: 'number' }),
    seriesId: bigint('series_id', { mode: 'number' }),
    /** Valve node_type: 1=Bo1, 2=Bo2, 3=Bo3, 4=Bo5 (undocumented, treated as opaque). */
    nodeType: smallint('node_type'),
    scheduledTime: integer('scheduled_time'),
    actualTime: integer('actual_time'),
    team1Wins: smallint('team_1_wins'),
    team2Wins: smallint('team_2_wins'),
    hasStarted: boolean('has_started'),
    isCompleted: boolean('is_completed'),
    winningNodeId: integer('winning_node_id'),
    losingNodeId: integer('losing_node_id'),
    incomingNodeId1: integer('incoming_node_id_1'),
    incomingNodeId2: integer('incoming_node_id_2'),
    streamIds: jsonb('stream_ids'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.leagueId, t.nodeId] }),
    index('bracket_nodes_league_time_idx').on(t.leagueId, t.scheduledTime),
    index('bracket_nodes_series_idx').on(t.seriesId),
    /**
     * The home page's calendar window, and the one index it actually needs.
     *
     * /api/schedule/range filters on `coalesce(nullif(actual_time,0), nullif(scheduled_time,0))`
     * across ALL leagues — a series belongs to the day it was played, and Valve never revises
     * scheduled_time. The composite above cannot serve that: it leads with league_id, which
     * the predicate does not mention, and it indexes a bare column rather than the expression.
     * So the route the front page polls every two minutes was a sequential scan over every
     * bracket node of every league ever synced.
     */
    index('bracket_nodes_effective_time_idx').on(
      sql`(coalesce(nullif(${t.actualTime}, 0), nullif(${t.scheduledTime}, 0)))`,
    ),
  ],
)

/**
 * A Bo1/Bo3/Bo5 series. `matchIds` preserves Valve's order, which is the map order —
 * that ordering is what drives the "Game 1 / Game 2 / Game 3" tabs.
 */
export const series = pgTable(
  'series',
  {
    seriesId: bigint('series_id', { mode: 'number' }).primaryKey(),
    leagueId: bigint('league_id', { mode: 'number' }),
    nodeId: integer('node_id'),
    /** Valve series_type: 0=Bo1, 1=Bo3, 2=Bo5. */
    seriesType: smallint('series_type'),
    team1Id: bigint('team_1_id', { mode: 'number' }),
    team2Id: bigint('team_2_id', { mode: 'number' }),
    team1Name: text('team_1_name'),
    team2Name: text('team_2_name'),
    startTime: integer('start_time'),
    scheduledTime: integer('scheduled_time'),
    team1Wins: smallint('team_1_wins'),
    team2Wins: smallint('team_2_wins'),
    /** number[] in map order. */
    matchIds: jsonb('match_ids').$type<number[]>(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('series_league_idx').on(t.leagueId),
    // Same calendar window as bracket_nodes, same reason — /api/schedule/range reads both.
    index('series_effective_time_idx').on(
      sql`(coalesce(nullif(${t.startTime}, 0), nullif(${t.scheduledTime}, 0)))`,
    ),
  ],
)

// ─── Matches ─────────────────────────────────────────────────────────────────

export type IngestStatus = 'live' | 'awaiting_parse' | 'complete' | 'failed'

export const matches = pgTable(
  'matches',
  {
    matchId: bigint('match_id', { mode: 'number' }).primaryKey(),
    seriesId: bigint('series_id', { mode: 'number' }),
    leagueId: bigint('league_id', { mode: 'number' }),
    leagueName: text('league_name'),
    /** 1-based position within the series, from series_infos.match_ids order. */
    gameInSeries: smallint('game_in_series'),

    radiantTeamId: bigint('radiant_team_id', { mode: 'number' }),
    direTeamId: bigint('dire_team_id', { mode: 'number' }),
    radiantTeamName: text('radiant_team_name'),
    direTeamName: text('dire_team_name'),
    /** Resolved logo URLs, never raw ugcids. */
    radiantLogoUrl: text('radiant_logo_url'),
    direLogoUrl: text('dire_logo_url'),

    startTime: integer('start_time'),
    duration: integer('duration'),
    radiantWin: boolean('radiant_win'),
    radiantScore: integer('radiant_score'),
    direScore: integer('dire_score'),
    gameState: smallint('game_state'),

    ingestStatus: text('ingest_status').$type<IngestStatus>().notNull().default('live'),
    backfillAttempts: smallint('backfill_attempts').notNull().default(0),
    /** Next time postMatchBackfill may retry this match (exponential backoff). */
    backfillNextAt: timestamp('backfill_next_at', { withTimezone: true }),

    firstSnapshotT: integer('first_snapshot_t'),
    lastSnapshotT: integer('last_snapshot_t'),
    snapshotCount: integer('snapshot_count').notNull().default(0),

    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('matches_league_idx').on(t.leagueId),
    index('matches_series_idx').on(t.seriesId),
    index('matches_status_idx').on(t.ingestStatus),
    index('matches_start_idx').on(t.startTime),
    /**
     * The backfill queue's own claim query, which runs every tick:
     *   where ingest_status='awaiting_parse' and backfill_attempts < 12
     *     and (backfill_next_at is null or backfill_next_at <= now)
     * Partial, because 'awaiting_parse' is a transient state — a finished tournament leaves
     * thousands of 'complete' rows behind and none of them belong in this index.
     */
    index('matches_backfill_idx')
      .on(t.backfillNextAt)
      .where(sql`${t.ingestStatus} = 'awaiting_parse'`),
    /** /api/matches: filter by status, newest first. matches_status_idx cannot order. */
    index('matches_status_start_idx').on(t.ingestStatus, t.startTime.desc()),
  ],
)

/**
 * The raw truth for time travel: one row per sampler tick, holding the exact
 * enriched payload the BFF would have served at that moment. `/api/matches/:id/at`
 * replays these verbatim, which is why MatchPage renders archived state without
 * a single component change.
 *
 * Volume: ~30 KB × 2/min × ~45 min ≈ 3 MB per match before TOAST compression.
 */
export const matchSnapshots = pgTable(
  'match_snapshots',
  {
    matchId: bigint('match_id', { mode: 'number' }).notNull(),
    /** Game seconds. Ticks land ~30s apart but are not aligned to a grid. */
    t: integer('t').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    gameState: smallint('game_state'),
    payload: jsonb('payload').notNull(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.t] })],
)

// ─── Derived per-minute series ───────────────────────────────────────────────

export const matchTimeline = pgTable(
  'match_timeline',
  {
    matchId: bigint('match_id', { mode: 'number' }).notNull(),
    minute: integer('minute').notNull(),
    /** Radiant-positive, matching historySampler.buildSample's sign convention. */
    radiantGoldAdv: integer('radiant_gold_adv'),
    radiantXpAdv: integer('radiant_xp_adv'),
    radiantNetWorth: integer('radiant_net_worth'),
    direNetWorth: integer('dire_net_worth'),
    radiantScore: integer('radiant_score'),
    direScore: integer('dire_score'),
    /** Valve building bitmasks — may be absent, never decode without checking. */
    radiantTowers: integer('radiant_towers'),
    direTowers: integer('dire_towers'),
    radiantBarracks: integer('radiant_barracks'),
    direBarracks: integer('dire_barracks'),
    roshanKills: smallint('roshan_kills'),
    /** Win-probability curve — the three bars sampled every tick, not just "now". */
    winProbStratz: real('win_prob_stratz'),
    winProbGold: real('win_prob_gold'),
    winProbEstimate: real('win_prob_estimate'),
    source: text('source').$type<'live' | 'opendota'>().notNull().default('live'),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.minute] })],
)

export const playerTimeline = pgTable(
  'player_timeline',
  {
    matchId: bigint('match_id', { mode: 'number' }).notNull(),
    minute: integer('minute').notNull(),
    /** 0-4 Radiant, 5-9 Dire. Stable across a match even when account_id is hidden. */
    playerSlot: smallint('player_slot').notNull(),
    accountId: bigint('account_id', { mode: 'number' }),
    heroId: integer('hero_id'),
    /** 0 = Radiant, 1 = Dire. */
    team: smallint('team'),
    playerName: text('player_name'),
    netWorth: integer('net_worth'),
    xp: integer('xp'),
    level: smallint('level'),
    kills: smallint('kills'),
    deaths: smallint('deaths'),
    assists: smallint('assists'),
    lastHits: integer('last_hits'),
    denies: integer('denies'),
    gpm: integer('gpm'),
    xpm: integer('xpm'),
    /** Item ids in slot order [item0..item5, neutral, backpack0..2]. */
    items: jsonb('items').$type<number[]>(),
    positionX: real('position_x'),
    positionY: real('position_y'),
    ultimateState: smallint('ultimate_state'),
    ultimateCooldown: integer('ultimate_cooldown'),
    respawnTimer: integer('respawn_timer'),
    source: text('source').$type<'live' | 'opendota'>().notNull().default('live'),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.minute, t.playerSlot] }),
    // No index on account_id or hero_id. Two used to sit here, and nothing queried either:
    // every read of this table is by match_id and minute (reconstruct.ts, analysis/index.ts).
    // This is the largest table in the archive — ~600 rows per match, inserted in batches of
    // 500 during every backfill — so each unused index was pure write cost. Add one back the
    // day a "matches this player appeared in" query exists, not before.
  ],
)

export type MatchEventType =
  | 'tower'
  | 'barracks'
  | 'roshan'
  | 'first_blood'
  | 'teamfight'
  | 'pick'
  | 'ban'
  | 'aegis'
  | 'building'
  /**
   * A hero death. From the live path this is counter-diffing at 30s resolution (victim
   * known, killer not attributable); from OpenDota it is the exact kills_log entry.
   */
  | 'kill'

export const matchEvents = pgTable(
  'match_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    matchId: bigint('match_id', { mode: 'number' }).notNull(),
    /** Game seconds. */
    t: integer('t').notNull(),
    type: text('type').$type<MatchEventType>().notNull(),
    team: smallint('team'),
    payload: jsonb('payload'),
    source: text('source').$type<'live' | 'opendota'>().notNull().default('live'),
    /**
     * Stable identity for idempotent upserts across ticks and across sources,
     * e.g. "tower:0:t1_mid" or "roshan:2". Without it the diff-detector would
     * re-insert the same tower kill on every retry.
     */
    dedupeKey: text('dedupe_key').notNull(),
  },
  (t) => [
    uniqueIndex('match_events_dedupe_idx').on(t.matchId, t.dedupeKey),
    index('match_events_match_t_idx').on(t.matchId, t.t),
  ],
)

// ─── Post-match ──────────────────────────────────────────────────────────────

/** Untouched OpenDota /matches/{id} body — the source for every backfilled row. */
export const postMatchRaw = pgTable('post_match_raw', {
  matchId: bigint('match_id', { mode: 'number' }).primaryKey(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  opendota: jsonb('opendota').notNull(),
})

/** Derived insights (momentum swings, laning verdict, objective impact). */
export const matchAnalysis = pgTable('match_analysis', {
  matchId: bigint('match_id', { mode: 'number' }).primaryKey(),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  /** Schema version so a changed analyser can invalidate old rows. */
  version: smallint('version').notNull().default(1),
  data: jsonb('data').notNull(),
})
