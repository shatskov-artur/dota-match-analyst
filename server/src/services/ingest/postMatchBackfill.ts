import { and, desc, eq, lte, lt, or, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  matches,
  matchTimeline,
  playerTimeline,
  matchEvents,
  postMatchRaw,
} from '../../db/schema.js'
import { getMatchDetail, type OpenDotaMatch } from '../openDotaApi.js'
import { computeAndStoreAnalysis } from '../analysis/index.js'
import { trackedLeagueIds } from '../../env.js'
import { logger, briefError } from '../../logger.js'

// Fills the archive from OpenDota's parsed replay once a match is over.
//
// This is the safety net for the whole design: if the machine was asleep, or the
// sampler missed ticks, the per-minute gold/xp/lh curves and the objective log are
// still recoverable here. What is NOT recoverable is anything the replay parser does
// not expose per minute — hero positions, ability cooldowns, live building bitmasks —
// which is why rows are tagged `source` and the UI can say so.
//
// Backoff: replays typically parse within minutes but can take much longer. Attempts
// are spaced 10min, 20min, 40min … capped, and abandoned after MAX_ATTEMPTS.

const MAX_ATTEMPTS = 12
const BASE_DELAY_MIN = 10
const MAX_DELAY_MIN = 240
/** Matches per tick. Keeps the 2 req/s OpenDota queue from starving live enrichment. */
const BATCH = 5
/** A live match not seen in the Valve feed for this long is over. */
const STALE_LIVE_MINUTES = 4

type Rec = Record<string, unknown>
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

function nextDelayMinutes(attempt: number): number {
  return Math.min(BASE_DELAY_MIN * 2 ** attempt, MAX_DELAY_MIN)
}

/**
 * Matches whose last Valve sighting is old but which are still flagged `live`.
 *
 * Preferred over reacting to game_state === 6: Valve frequently drops a finished match
 * out of GetLiveLeagueGames entirely instead of publishing the post-game state, so a
 * purely event-driven close would leave those rows stuck as `live` forever.
 */
export async function closeStaleLiveMatches(): Promise<number> {
  if (!db) return 0
  const cutoff = new Date(Date.now() - STALE_LIVE_MINUTES * 60_000)
  const closed = await db
    .update(matches)
    .set({ ingestStatus: 'awaiting_parse', backfillNextAt: new Date() })
    .where(and(eq(matches.ingestStatus, 'live'), lt(matches.lastSeenAt, cutoff)))
    .returning({ matchId: matches.matchId })
  if (closed.length > 0) {
    logger.info({ matchIds: closed.map((c) => c.matchId) }, 'archive: closed stale live matches')
  }
  return closed.length
}

// ─── Pure expanders (unit-tested) ────────────────────────────────────────────

export interface MinuteRow {
  minute: number
  radiantGoldAdv: number | null
  radiantXpAdv: number | null
  radiantScore: number | null
  direScore: number | null
}

/**
 * radiant_gold_adv / radiant_xp_adv are indexed by minute and Radiant-positive —
 * the same convention the live sampler uses, so the two sources are directly comparable.
 *
 * Per-minute scores are reconstructed from every player's `kills_log`, which is the only
 * timestamped kill record OpenDota exposes. Absent on unparsed or old matches → null.
 */
export function expandMinutes(m: OpenDotaMatch): MinuteRow[] {
  const gold = arr(m.radiant_gold_adv).map(num)
  const xp = arr(m.radiant_xp_adv).map(num)
  const len = Math.max(gold.length, xp.length)
  if (len === 0) return []

  // Cumulative kills per minute from kills_log (times are game seconds, can be negative
  // during pre-horn, which floors to minute -1 — clamp to 0).
  const radiantKills = new Array<number>(len).fill(0)
  const direKills = new Array<number>(len).fill(0)
  let sawKillsLog = false
  for (const p of arr(m.players)) {
    const player = p as Rec
    const log = arr(player.kills_log)
    if (log.length === 0) continue
    sawKillsLog = true
    const slot = num(player.player_slot) ?? 0
    // player_slot < 128 is Radiant (Valve's slot encoding, mirrored by OpenDota).
    const bucket = slot < 128 ? radiantKills : direKills
    for (const k of log) {
      const t = num((k as Rec).time)
      if (t === null) continue
      const idx = Math.max(0, Math.floor(t / 60))
      if (idx < len) bucket[idx] += 1
    }
  }
  if (sawKillsLog) {
    for (let i = 1; i < len; i++) {
      radiantKills[i] += radiantKills[i - 1]
      direKills[i] += direKills[i - 1]
    }
  }

  const out: MinuteRow[] = []
  for (let i = 0; i < len; i++) {
    out.push({
      minute: i,
      radiantGoldAdv: gold[i] ?? null,
      radiantXpAdv: xp[i] ?? null,
      radiantScore: sawKillsLog ? radiantKills[i] : null,
      direScore: sawKillsLog ? direKills[i] : null,
    })
  }
  return out
}

export interface PlayerMinuteRow {
  minute: number
  playerSlot: number
  accountId: number | null
  heroId: number | null
  team: number
  playerName: string | null
  netWorth: number | null
  xp: number | null
  lastHits: number | null
  denies: number | null
}

/**
 * gold_t / xp_t / lh_t / dn_t are cumulative, indexed by minute.
 *
 * player_slot is normalised from OpenDota's Valve encoding (0-4 Radiant, 128-132 Dire)
 * to the archive's 0-9 so live-sampled and backfilled rows share a primary key.
 */
export function expandPlayerMinutes(m: OpenDotaMatch): PlayerMinuteRow[] {
  const out: PlayerMinuteRow[] = []
  for (const p of arr(m.players)) {
    const player = p as Rec
    const rawSlot = num(player.player_slot)
    if (rawSlot === null) continue
    const isRadiant = rawSlot < 128
    const slot = isRadiant ? rawSlot : 5 + (rawSlot - 128)
    if (slot < 0 || slot > 9) continue

    const goldT = arr(player.gold_t).map(num)
    const xpT = arr(player.xp_t).map(num)
    const lhT = arr(player.lh_t).map(num)
    // dn_t sits right beside lh_t and was simply never read, which is why a reconstructed
    // match showed "118/—" where the denies belong.
    const dnT = arr(player.dn_t).map(num)
    const len = Math.max(goldT.length, xpT.length, lhT.length, dnT.length)
    const accountId = num(player.account_id)
    const heroId = num(player.hero_id)
    const name = typeof player.name === 'string' ? player.name : typeof player.personaname === 'string' ? player.personaname : null

    for (let i = 0; i < len; i++) {
      out.push({
        minute: i,
        playerSlot: slot,
        accountId,
        heroId,
        team: isRadiant ? 0 : 1,
        playerName: name,
        netWorth: goldT[i] ?? null,
        xp: xpT[i] ?? null,
        lastHits: lhT[i] ?? null,
        denies: dnT[i] ?? null,
      })
    }
  }
  return out
}

export interface ExpandedEvent {
  t: number
  type: 'tower' | 'barracks' | 'roshan' | 'first_blood' | 'teamfight' | 'pick' | 'ban' | 'aegis' | 'building' | 'kill'
  team: number | null
  dedupeKey: string
  payload: Rec
}

/**
 * Exact kills from the parsed replay.
 *
 * `kills_log` is per killer and names the victim's hero (`key`: "npc_dota_hero_axe"),
 * which is strictly better than the live path's counter diffing — that knows a hero died
 * in a 30s window but not who killed them. These carry the `od:` namespace so both sets
 * coexist and the feed can prefer the precise one.
 */
export function expandKills(m: OpenDotaMatch): ExpandedEvent[] {
  const out: ExpandedEvent[] = []
  for (const p of arr(m.players)) {
    const player = p as Rec
    const rawSlot = num(player.player_slot)
    if (rawSlot === null) continue
    const isRadiant = rawSlot < 128
    const slot = isRadiant ? rawSlot : 5 + (rawSlot - 128)
    arr(player.kills_log).forEach((k, i) => {
      const entry = k as Rec
      const t = num(entry.time)
      if (t === null) return
      out.push({
        t,
        type: 'kill',
        // Attributed to the KILLER's team here; the live path keys off the victim's team.
        // The feed reads `victimHero`/`killerSlot` rather than the column either way.
        team: isRadiant ? 0 : 1,
        dedupeKey: `od:kill:${slot}:${i}`,
        payload: {
          killerSlot: slot,
          killerHeroId: num(player.hero_id),
          killerName: typeof player.name === 'string' ? player.name : (player.personaname ?? null),
          killerTeam: isRadiant ? 0 : 1,
          victimHero: typeof entry.key === 'string' ? entry.key : null,
        },
      })
    })
  }
  return out.sort((a, b) => a.t - b.t)
}

/**
 * objectives[] + teamfights[] + picks_bans[] → archive events.
 *
 * dedupeKey is source-qualified (`od:`) so an OpenDota tower kill and the sampler's own
 * diff-detected one coexist instead of one silently masking the other — they carry
 * different precision (exact second vs. 30s tick) and the UI prefers the exact one.
 */
/**
 * OpenDota objectives report `team` in Valve's chat encoding: 2 = Radiant, 3 = Dire.
 * The archive uses 0/1 everywhere else, so normalise at the boundary rather than making
 * every reader remember which convention a row came from.
 */
export function normalizeTeam(raw: unknown): number | null {
  const t = num(raw)
  if (t === 2 || t === 0) return 0
  if (t === 3 || t === 1) return 1
  return null
}

export interface ParsedBuilding {
  side: 'radiant' | 'dire'
  lane: 'top' | 'mid' | 'bot' | 'ancient' | null
  tier: string | null
  kind: 'tower' | 'barracks' | 'fort' | 'other'
}

/**
 * "npc_dota_badguys_tower2_top" → which building actually fell.
 *
 * Without this every `building_kill` renders as an anonymous "a building fell", which is
 * the one thing a match log must not be. goodguys = Radiant, badguys = Dire.
 */
export function parseBuildingKey(key: unknown): ParsedBuilding | null {
  if (typeof key !== 'string') return null
  const s = key.toLowerCase()
  const side = s.includes('goodguys') ? 'radiant' : s.includes('badguys') ? 'dire' : null
  if (!side) return null

  const lane = s.includes('_top') ? 'top' : s.includes('_mid') ? 'mid' : s.includes('_bot') ? 'bot' : null

  if (s.includes('rax') || s.includes('barracks')) {
    return { side, lane, tier: s.includes('melee') ? 'melee' : s.includes('range') ? 'ranged' : null, kind: 'barracks' }
  }
  if (s.includes('fort')) return { side, lane: null, tier: null, kind: 'fort' }
  const tierMatch = /tower(\d)/.exec(s)
  if (tierMatch) {
    // Tier-4 towers guard the ancient and carry no lane.
    const tier = `T${tierMatch[1]}`
    return { side, lane: tierMatch[1] === '4' ? 'ancient' : lane, tier, kind: 'tower' }
  }
  return { side, lane, tier: null, kind: 'other' }
}

export function expandEvents(m: OpenDotaMatch): ExpandedEvent[] {
  const out: ExpandedEvent[] = []

  const objectives = arr(m.objectives)
  objectives.forEach((o, i) => {
    const obj = o as Rec
    const t = num(obj.time)
    if (t === null) return
    const rawType = typeof obj.type === 'string' ? obj.type : ''
    const building = parseBuildingKey(obj.key)
    // A building_kill names its owner in the key; a chat objective uses the team field.
    const team = building ? (building.side === 'radiant' ? 0 : 1) : normalizeTeam(obj.team)
    const base = {
      t,
      team,
      // Keep the untouched objective under `raw` and surface the parsed fields alongside,
      // so the UI reads one shape whatever produced the row.
      payload: building ? { ...obj, ...building, raw: obj } : obj,
    }
    switch (rawType) {
      case 'CHAT_MESSAGE_TOWER_KILL':
      case 'CHAT_MESSAGE_TOWER_DENY':
        out.push({ ...base, type: 'tower', dedupeKey: `od:tower:${i}:${t}` })
        break
      case 'CHAT_MESSAGE_BARRACKS_KILL':
        out.push({ ...base, type: 'barracks', dedupeKey: `od:barracks:${i}:${t}` })
        break
      case 'CHAT_MESSAGE_ROSHAN_KILL':
        out.push({ ...base, type: 'roshan', dedupeKey: `od:roshan:${i}:${t}` })
        break
      case 'CHAT_MESSAGE_FIRSTBLOOD':
        out.push({ ...base, type: 'first_blood', dedupeKey: `od:first_blood:${t}` })
        break
      case 'CHAT_MESSAGE_AEGIS':
      case 'CHAT_MESSAGE_AEGIS_STOLEN':
        out.push({ ...base, type: 'aegis', dedupeKey: `od:aegis:${i}:${t}` })
        break
      case 'building_kill':
        // Route to the specific type when the key says what it was, so towers and
        // barracks read the same whichever objective line reported them.
        out.push({
          ...base,
          type: building?.kind === 'barracks' ? 'barracks' : building?.kind === 'tower' ? 'tower' : 'building',
          dedupeKey: `od:building:${i}:${t}`,
        })
        break
      default:
        break
    }
  })

  arr(m.teamfights).forEach((f, i) => {
    const fight = f as Rec
    const start = num(fight.start)
    if (start === null) return
    // teamfights[].players is positional: indices 0-4 Radiant, 5-9 Dire. Splitting the
    // deaths per side is what lets the feed say who came out ahead on bodies rather than
    // just "4 deaths".
    const fightPlayers = arr(fight.players)
    const deathsAt = (i0: number, i1: number): number =>
      fightPlayers.slice(i0, i1).reduce<number>((s, p) => s + (num((p as Rec).deaths) ?? 0), 0)
    const radiantDeaths = fightPlayers.length >= 10 ? deathsAt(0, 5) : null
    const direDeaths = fightPlayers.length >= 10 ? deathsAt(5, 10) : null
    out.push({
      t: start,
      type: 'teamfight',
      team: null,
      dedupeKey: `od:teamfight:${i}:${start}`,
      payload: {
        from: start,
        to: num(fight.end) ?? start,
        start,
        end: num(fight.end),
        deaths: num(fight.deaths),
        last_death: num(fight.last_death),
        radiantDeaths,
        direDeaths,
        winner:
          radiantDeaths === null || direDeaths === null || radiantDeaths === direDeaths
            ? null
            : radiantDeaths < direDeaths
              ? 0
              : 1,
      },
    })
  })

  out.push(...expandKills(m))

  arr(m.picks_bans).forEach((pb) => {
    const p = pb as Rec
    const order = num(p.order)
    const heroId = num(p.hero_id)
    if (order === null || heroId === null) return
    out.push({
      // Draft happens before the game clock starts; a negative t keeps ordering sane
      // and puts picks left of minute 0 on any timeline.
      t: -1000 + order,
      type: p.is_pick === true ? 'pick' : 'ban',
      team: num(p.team),
      dedupeKey: `od:draft:${order}`,
      payload: { order, heroId, isPick: p.is_pick === true, team: num(p.team) },
    })
  })

  return out
}

// ─── I/O ─────────────────────────────────────────────────────────────────────

export type BackfillOutcome = 'complete' | 'unparsed' | 'missing' | 'failed'

export async function backfillMatch(matchId: number): Promise<BackfillOutcome> {
  if (!db) return 'failed'

  const detail = await getMatchDetail(matchId)
  if (!detail) return 'missing'

  // `version` is OpenDota's parse marker. Null → the replay has not been processed and
  // the per-minute arrays are simply absent; asking again later is the only remedy.
  const parsed = detail.version !== null && detail.version !== undefined
  const minutes = expandMinutes(detail)
  const full = parsed || minutes.length > 0

  // The RESULT does not wait for the replay.
  //
  // radiant_win, the final score and the duration are in OpenDota's summary within a
  // minute of a game ending, while a parse can take another twenty. Returning 'unparsed'
  // here used to throw that away and requeue with a 10/20/40-minute backoff, so a match
  // whose outcome every scoreboard on the internet already showed stayed blank here.
  // The summary is written on its own; only the timeline and event log wait for the parse.
  const radiantWin = typeof detail.radiant_win === 'boolean' ? detail.radiant_win : null
  if (radiantWin !== null) {
    await db
      .update(matches)
      .set({
        radiantWin,
        radiantScore: num(detail.radiant_score) ?? undefined,
        direScore: num(detail.dire_score) ?? undefined,
        duration: num(detail.duration) ?? undefined,
        startTime: num(detail.start_time) ?? undefined,
        gameState: 6,
      })
      .where(eq(matches.matchId, matchId))
  }

  if (!full) return 'unparsed'

  await db
    .insert(postMatchRaw)
    .values({ matchId, opendota: detail, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: postMatchRaw.matchId,
      set: { opendota: sql`excluded.opendota`, fetchedAt: sql`excluded.fetched_at` },
    })

  // ─── match summary ─────────────────────────────────────────────────────────
  // Rewritten in full here — the early result write above covers only what a scoreboard
  // needs, this adds the league, series and team names that come with a parsed payload.
  await db
    .update(matches)
    .set({
      leagueId: num(detail.leagueid) ?? undefined,
      seriesId: num(detail.series_id) || undefined,
      startTime: num(detail.start_time) ?? undefined,
      duration: num(detail.duration) ?? undefined,
      radiantWin,
      radiantScore: num(detail.radiant_score) ?? undefined,
      direScore: num(detail.dire_score) ?? undefined,
      radiantTeamName:
        typeof (detail.radiant_team as Rec | undefined)?.name === 'string'
          ? ((detail.radiant_team as Rec).name as string)
          : undefined,
      direTeamName:
        typeof (detail.dire_team as Rec | undefined)?.name === 'string'
          ? ((detail.dire_team as Rec).name as string)
          : undefined,
      ingestStatus: 'complete',
      gameState: 6,
    })
    .where(eq(matches.matchId, matchId))

  // ─── per-minute ────────────────────────────────────────────────────────────
  if (minutes.length > 0) {
    await db
      .insert(matchTimeline)
      .values(
        minutes.map((r) => ({
          matchId,
          minute: r.minute,
          radiantGoldAdv: r.radiantGoldAdv,
          radiantXpAdv: r.radiantXpAdv,
          radiantScore: r.radiantScore,
          direScore: r.direScore,
          source: 'opendota' as const,
        })),
      )
      .onConflictDoUpdate({
        target: [matchTimeline.matchId, matchTimeline.minute],
        set: {
          radiantGoldAdv: sql`excluded.radiant_gold_adv`,
          radiantXpAdv: sql`excluded.radiant_xp_adv`,
          // Keep the sampled score when OpenDota could not reconstruct one.
          radiantScore: sql`coalesce(excluded.radiant_score, ${matchTimeline.radiantScore})`,
          direScore: sql`coalesce(excluded.dire_score, ${matchTimeline.direScore})`,
          source: sql`excluded.source`,
        },
      })
  }

  const playerRows = expandPlayerMinutes(detail)
  if (playerRows.length > 0) {
    // Chunked: a 60-minute game is 600 rows, and postgres-js builds one statement per call.
    for (let i = 0; i < playerRows.length; i += 500) {
      await db
        .insert(playerTimeline)
        .values(
          playerRows.slice(i, i + 500).map((r) => ({
            matchId,
            minute: r.minute,
            playerSlot: r.playerSlot,
            accountId: r.accountId,
            heroId: r.heroId,
            team: r.team,
            playerName: r.playerName,
            netWorth: r.netWorth,
            xp: r.xp,
            lastHits: r.lastHits,
            denies: r.denies,
            source: 'opendota' as const,
          })),
        )
        .onConflictDoUpdate({
          target: [playerTimeline.matchId, playerTimeline.minute, playerTimeline.playerSlot],
          set: {
            accountId: sql`coalesce(excluded.account_id, ${playerTimeline.accountId})`,
            heroId: sql`coalesce(excluded.hero_id, ${playerTimeline.heroId})`,
            team: sql`excluded.team`,
            playerName: sql`coalesce(excluded.player_name, ${playerTimeline.playerName})`,
            netWorth: sql`coalesce(excluded.net_worth, ${playerTimeline.netWorth})`,
            xp: sql`coalesce(excluded.xp, ${playerTimeline.xp})`,
            lastHits: sql`coalesce(excluded.last_hits, ${playerTimeline.lastHits})`,
            denies: sql`coalesce(excluded.denies, ${playerTimeline.denies})`,
            source: sql`excluded.source`,
          },
        })
    }
  }

  const events = expandEvents(detail)
  if (events.length > 0) {
    await db
      .insert(matchEvents)
      .values(
        events.map((e) => ({
          matchId,
          t: e.t,
          type: e.type,
          team: e.team,
          payload: e.payload,
          dedupeKey: e.dedupeKey,
          source: 'opendota' as const,
        })),
      )
      .onConflictDoNothing({ target: [matchEvents.matchId, matchEvents.dedupeKey] })
  }

  logger.info(
    { matchId, minutes: minutes.length, playerRows: playerRows.length, events: events.length },
    'archive: backfill complete',
  )

  // Analysis runs on the merged result, so it sees OpenDota precision where available and
  // the sampler's rows where not. A failure here must not undo a successful backfill.
  try {
    await computeAndStoreAnalysis(matchId)
  } catch (err) {
    logger.error({ matchId, err: briefError(err) }, 'archive: analysis failed')
  }

  return 'complete'
}

export interface BackfillTickResult {
  attempted: number
  complete: number
  unparsed: number
  missing: number
  failed: number
}

export async function runBackfillTick(): Promise<BackfillTickResult> {
  const result: BackfillTickResult = { attempted: 0, complete: 0, unparsed: 0, missing: 0, failed: 0 }
  if (!db) return result

  await closeStaleLiveMatches()

  const now = new Date()
  const tracked = [...trackedLeagueIds]
  const due = await db
    .select({ matchId: matches.matchId, attempts: matches.backfillAttempts })
    .from(matches)
    .where(
      and(
        eq(matches.ingestStatus, 'awaiting_parse'),
        lt(matches.backfillAttempts, MAX_ATTEMPTS),
        or(isNull(matches.backfillNextAt), lte(matches.backfillNextAt, now)),
      ),
    )
    // The tournament being recorded goes first, then newest. Five matches per ten minutes
    // is a slow queue, so an unordered one lets any backlog starve the games that matter —
    // and a backlog is exactly what a stray league full of history creates.
    .orderBy(
      tracked.length > 0
        ? sql`case when ${matches.leagueId} in ${sql`(${sql.join(tracked.map((id) => sql`${id}`), sql`, `)})`} then 0 else 1 end`
        : sql`0`,
      desc(matches.startTime),
      desc(matches.matchId),
    )
    .limit(BATCH)

  for (const row of due) {
    result.attempted++
    let outcome: BackfillOutcome
    try {
      outcome = await backfillMatch(row.matchId)
    } catch (err) {
      logger.error({ matchId: row.matchId, err: briefError(err) }, 'archive: backfill threw')
      outcome = 'failed'
    }
    result[outcome]++

    if (outcome === 'complete') continue

    const attempts = (row.attempts ?? 0) + 1
    const giveUp = attempts >= MAX_ATTEMPTS
    await db
      .update(matches)
      .set({
        backfillAttempts: attempts,
        backfillNextAt: new Date(Date.now() + nextDelayMinutes(attempts) * 60_000),
        // 'failed' is not the end of the world: the raw snapshots are still there and
        // the match remains fully browsable, it just never got OpenDota's precision.
        ingestStatus: giveUp ? 'failed' : 'awaiting_parse',
      })
      .where(eq(matches.matchId, row.matchId))
    if (giveUp) {
      logger.warn({ matchId: row.matchId, attempts }, 'archive: giving up on backfill')
    }
  }

  if (result.attempted > 0) logger.info(result, 'archive: backfill tick')
  return result
}
