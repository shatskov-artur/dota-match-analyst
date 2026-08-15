import { sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  matches,
  matchSnapshots,
  matchTimeline,
  playerTimeline,
  matchEvents,
} from '../../db/schema.js'
import { buildingDecoder } from '../../../../shared/buildingDecoder.js'
import {
  extractScoreboardInputs,
  computeGoldWinProb,
  computeEstWinProb,
} from '../winProbHeuristic.js'
import type { EnrichedLiveGame } from '../liveAggregator.js'
import { logger } from '../../logger.js'

// Turns one enriched live payload into archive rows.
//
// Layering: pure extractors first (no I/O, unit-tested), then a single writeSnapshot()
// that performs the upserts. Everything is keyed so a repeated tick is a no-op.
//
// `source` discipline: every row written here is 'live'. postMatchBackfill writes
// 'opendota' rows and those must never be clobbered by a late live tick, so each
// upsert carries `setWhere: source = 'live'`.

type Rec = Record<string, unknown>

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// ─── Pure extractors ─────────────────────────────────────────────────────────

export interface TimelineFacts {
  t: number
  minute: number
  radiantGoldAdv: number | null
  radiantXpAdv: number | null
  radiantNetWorth: number | null
  direNetWorth: number | null
  radiantScore: number | null
  direScore: number | null
  radiantTowers: number | null
  direTowers: number | null
  radiantBarracks: number | null
  direBarracks: number | null
  roshanKills: number | null
}

/**
 * Radiant-positive gold/XP, matching historySampler.buildSample's sign convention so
 * archived rows line up with the Redis timeseries the live UI already draws.
 *
 * XP is an approximation (Σ xpm × duration / 60) because Valve's live feed carries no
 * cumulative XP. postMatchBackfill later overwrites the minute with OpenDota's exact
 * radiant_xp_adv, which is why `source` matters.
 */
export function extractTimelineFacts(game: EnrichedLiveGame): TimelineFacts | null {
  const sb = game.scoreboard as Rec | undefined
  const t = num(game.duration) ?? num(sb?.duration)
  if (t === null || t < 0) return null

  const r = sb?.radiant as Rec | undefined
  const d = sb?.dire as Rec | undefined
  const rPlayers = (r?.players as Rec[] | undefined) ?? []
  const dPlayers = (d?.players as Rec[] | undefined) ?? []

  const sumNw = (ps: Rec[]): number | null =>
    ps.length === 0 ? null : ps.reduce((s, p) => s + (num(p.net_worth) ?? 0), 0)
  // Mirrors historySampler.xpmOf — Valve's canonical field is xp_per_min, older
  // fixtures use xpm; a non-finite value contributes 0 (undercount over crash).
  const teamXp = (ps: Rec[]): number | null =>
    ps.length === 0
      ? null
      : Math.round(ps.reduce((s, p) => s + ((num(p.xp_per_min) ?? num(p.xpm) ?? 0) * t) / 60, 0))

  const rNw = sumNw(rPlayers)
  const dNw = sumNw(dPlayers)
  const rXp = teamXp(rPlayers)
  const dXp = teamXp(dPlayers)

  return {
    t: Math.floor(t),
    minute: Math.floor(t / 60),
    radiantGoldAdv: rNw !== null && dNw !== null ? rNw - dNw : null,
    radiantXpAdv: rXp !== null && dXp !== null ? rXp - dXp : null,
    radiantNetWorth: rNw,
    direNetWorth: dNw,
    radiantScore: num(r?.score),
    direScore: num(d?.score),
    // building_state is the alternate field name some API versions use — check both,
    // and never decode a bitmask that is absent (CLAUDE.md pitfall).
    radiantTowers: num(r?.tower_state) ?? num(r?.building_state),
    direTowers: num(d?.tower_state) ?? num(d?.building_state),
    radiantBarracks: num(r?.barracks_state),
    direBarracks: num(d?.barracks_state),
    roshanKills: num(game.roshan?.killCount),
  }
}

export interface PlayerFacts {
  playerSlot: number
  accountId: number | null
  heroId: number | null
  team: number | null
  playerName: string | null
  netWorth: number | null
  xp: number | null
  level: number | null
  kills: number | null
  deaths: number | null
  assists: number | null
  lastHits: number | null
  denies: number | null
  gpm: number | null
  xpm: number | null
  items: number[]
  positionX: number | null
  positionY: number | null
  ultimateState: number | null
  ultimateCooldown: number | null
  respawnTimer: number | null
}

/**
 * One row per player. player_slot is derived (Radiant 0-4, Dire 5-9) because Valve's
 * live payload has no slot field — and it must stay stable across ticks even when
 * account_id is hidden (4294967295), which is why it is positional, not id-based.
 */
export function extractPlayerFacts(game: EnrichedLiveGame, t: number): PlayerFacts[] {
  const players = (game.players as Rec[] | undefined) ?? []
  const out: PlayerFacts[] = []
  let rIdx = 0
  let dIdx = 0
  for (const p of players) {
    const team = num(p.team)
    if (team !== 0 && team !== 1) continue // 2=broadcaster, 4=unassigned
    const slot = team === 0 ? rIdx++ : 5 + dIdx++
    if (slot > 9) continue
    const xpm = num(p.xpm)
    out.push({
      playerSlot: slot,
      accountId: num(p.account_id),
      heroId: num(p.hero_id),
      team,
      playerName: typeof p.name === 'string' ? p.name : null,
      netWorth: num(p.net_worth),
      xp: xpm !== null ? Math.round((xpm * t) / 60) : null,
      level: num(p.level),
      kills: num(p.kills),
      // Valve's field is `death`, singular — not `deaths`.
      deaths: num(p.death),
      assists: num(p.assists),
      lastHits: num(p.lh),
      denies: num(p.dn),
      gpm: num(p.gpm),
      xpm,
      items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item_neutral, p.item6, p.item7, p.item8].map(
        (i) => num(i) ?? 0,
      ),
      positionX: num(p.position_x),
      positionY: num(p.position_y),
      ultimateState: num(p.ultimate_state),
      ultimateCooldown: num(p.ultimate_cooldown),
      respawnTimer: num(p.respawn_timer),
    })
  }
  return out
}

export interface DetectedEvent {
  t: number
  type: 'tower' | 'barracks' | 'roshan' | 'kill' | 'teamfight'
  team: number | null
  dedupeKey: string
  payload: Rec
}

export interface PrevPlayer {
  heroId: number | null
  playerName: string | null
  team: number | null
  kills: number
  deaths: number
  /** Diffed alongside kills so a window can tell a killer from an assister. */
  assists: number
}

/** Previous observation, kept per match so consecutive ticks can be diffed. */
export interface PrevState {
  t?: number
  radiantTowers: number | null
  direTowers: number | null
  radiantBarracks: number | null
  direBarracks: number | null
  roshanKills: number | null
  /** Per player_slot, for kill/death diffing. */
  players?: Map<number, PrevPlayer>
}

/**
 * Deaths inside one 30s window that make it a teamfight rather than a pickoff.
 * Three is the conventional line and matches what OpenDota's own teamfight detector
 * produces closely enough for the two to sit in the same feed.
 */
export const TEAMFIGHT_MIN_DEATHS = 3

const LANES = ['top', 'mid', 'bot'] as const
const TIERS = ['tier1', 'tier2', 'tier3'] as const
const RAX = ['meleeRax', 'rangedRax'] as const

/**
 * Diff two building bitmasks into per-building "destroyed" events.
 *
 * Masks here are Valve's PER-TEAM values (scoreboard.{radiant,dire}.tower_state), not
 * the packed 32-bit pair. buildingDecoder reads the lower 16 bits as Radiant, so feeding
 * it a per-team mask and taking `.radiant` decodes that one team correctly.
 *
 * A bit that flips 1→0 is a destroyed building. The FIRST observation of a match emits
 * nothing — otherwise a mid-game restart would report every already-dead tower as
 * freshly destroyed.
 */
export function detectEvents(
  prev: PrevState | undefined,
  cur: TimelineFacts,
  players: PlayerFacts[] = [],
): DetectedEvent[] {
  if (!prev) return []
  const events: DetectedEvent[] = []

  // ── Kills and teamfights ───────────────────────────────────────────────────
  // Valve's live feed carries per-player kill/death COUNTERS, not a kill log, so the
  // feed is built by diffing counters between ticks. That means we know who died and
  // who scored kills in the window, but not who killed whom — the events say exactly
  // that rather than inventing an attribution. After the match, OpenDota's parsed
  // kills_log supersedes these with second-level precision.
  if (prev.players && prev.players.size > 0 && players.length > 0) {
    const windowFrom = prev.t ?? cur.t
    const killers: Array<{ playerSlot: number; heroId: number | null; playerName: string | null; count: number }> = []
    /**
     * Whose assist counter moved in the same window.
     *
     * Sits right beside the kill counter and was simply never read. Without it a window
     * with several deaths listed everyone who gained anything as having "scored", so a
     * player who only assisted was indistinguishable from the one who landed the kill —
     * which is the first thing anyone reading a fight wants to know.
     */
    const assisters: Array<{ playerSlot: number; heroId: number | null; playerName: string | null; count: number }> = []
    const victims: Array<{ playerSlot: number; heroId: number | null; playerName: string | null; team: number | null; deathNumber: number }> = []

    for (const p of players) {
      const before = prev.players.get(p.playerSlot)
      if (!before) continue
      const killDelta = (p.kills ?? 0) - before.kills
      if (killDelta > 0) {
        killers.push({ playerSlot: p.playerSlot, heroId: p.heroId, playerName: p.playerName, count: killDelta })
      }
      const assistDelta = (p.assists ?? 0) - before.assists
      if (assistDelta > 0) {
        assisters.push({ playerSlot: p.playerSlot, heroId: p.heroId, playerName: p.playerName, count: assistDelta })
      }
      const deathDelta = (p.deaths ?? 0) - before.deaths
      // A counter that went DOWN means Valve reset or re-ordered the scoreboard; ignore
      // rather than emit nonsense.
      for (let i = 1; i <= deathDelta; i++) {
        victims.push({
          playerSlot: p.playerSlot,
          heroId: p.heroId,
          playerName: p.playerName,
          team: p.team,
          deathNumber: before.deaths + i,
        })
      }
    }

    for (const v of victims) {
      events.push({
        t: cur.t,
        type: 'kill',
        // The event belongs to the team that LOST the hero; the feed reads it as a death.
        team: v.team,
        // Keyed on the victim's own cumulative death count, so replaying a tick cannot
        // duplicate it and a missed tick cannot renumber it.
        dedupeKey: `kill:${v.playerSlot}:${v.deathNumber}`,
        payload: {
          victimSlot: v.playerSlot,
          victimHeroId: v.heroId,
          victimName: v.playerName,
          victimTeam: v.team,
          killers,
          assisters,
          windowFrom,
          windowTo: cur.t,
        },
      })
    }

    if (victims.length >= TEAMFIGHT_MIN_DEATHS) {
      const radiantDeaths = victims.filter((v) => v.team === 0).length
      const direDeaths = victims.filter((v) => v.team === 1).length
      events.push({
        t: cur.t,
        type: 'teamfight',
        team: null,
        dedupeKey: `tf:${cur.t}`,
        payload: {
          from: windowFrom,
          to: cur.t,
          deaths: victims.length,
          radiantDeaths,
          direDeaths,
          // Who came out ahead on bodies. The gold verdict is computed later against the
          // timeline (services/analysis objectiveImpacts) rather than guessed here.
          winner: radiantDeaths === direDeaths ? null : radiantDeaths < direDeaths ? 0 : 1,
          victims: victims.map((v) => ({ heroId: v.heroId, name: v.playerName, team: v.team })),
        },
      })
    }
  }

  for (const team of [0, 1] as const) {
    const side = team === 0 ? 'radiant' : 'dire'
    const prevTowers = team === 0 ? prev.radiantTowers : prev.direTowers
    const curTowers = team === 0 ? cur.radiantTowers : cur.direTowers
    const prevRax = team === 0 ? prev.radiantBarracks : prev.direBarracks
    const curRax = team === 0 ? cur.radiantBarracks : cur.direBarracks
    if (prevTowers === null || curTowers === null) continue
    if (prevTowers === curTowers && prevRax === curRax) continue

    const before = buildingDecoder(prevTowers, prevRax ?? undefined).radiant
    const after = buildingDecoder(curTowers, curRax ?? undefined).radiant

    for (const lane of LANES) {
      for (const tier of TIERS) {
        if (before[lane][tier] && !after[lane][tier]) {
          events.push({
            t: cur.t,
            type: 'tower',
            team,
            dedupeKey: `tower:${side}:${lane}:${tier}`,
            payload: { side, lane, tier },
          })
        }
      }
      for (const kind of RAX) {
        if (before[lane][kind] && !after[lane][kind]) {
          events.push({
            t: cur.t,
            type: 'barracks',
            team,
            dedupeKey: `barracks:${side}:${lane}:${kind}`,
            payload: { side, lane, kind },
          })
        }
      }
    }
    // Ancients (tier 4) are not lane-scoped in the decoder output.
    if (before.ancientTop && !after.ancientTop) {
      events.push({ t: cur.t, type: 'tower', team, dedupeKey: `tower:${side}:ancient:top`, payload: { side, lane: 'ancient', tier: 'tier4' } })
    }
    if (before.ancientBottom && !after.ancientBottom) {
      events.push({ t: cur.t, type: 'tower', team, dedupeKey: `tower:${side}:ancient:bot`, payload: { side, lane: 'ancient', tier: 'tier4' } })
    }
  }

  if (prev.roshanKills !== null && cur.roshanKills !== null && cur.roshanKills > prev.roshanKills) {
    for (let n = prev.roshanKills + 1; n <= cur.roshanKills; n++) {
      events.push({ t: cur.t, type: 'roshan', team: null, dedupeKey: `roshan:${n}`, payload: { killNumber: n } })
    }
  }

  return events
}

// ─── I/O ─────────────────────────────────────────────────────────────────────

// Last observation per match, so consecutive ticks can be diffed without a DB read.
// Lost on restart: the first tick after a restart emits no events, and OpenDota's
// authoritative objectives[] fills the gap at backfill time.
const prevStates = new Map<number, PrevState>()

export function resetPrevState(matchId?: number): void {
  if (matchId === undefined) prevStates.clear()
  else prevStates.delete(matchId)
}

/**
 * Drop the diff state of every match that is no longer in the live feed.
 *
 * The caller used to try to do this itself by walking the matches it had just archived and
 * asking whether each was live — which is every one of them, by construction, so the loop
 * never deleted anything and this map grew for the whole uptime of the process. The set of
 * things to forget can only be computed from the KEYS HELD HERE, so the pruning belongs
 * here too. Returns how many were dropped, for the caller to log.
 */
export function prunePrevStates(liveMatchIds: ReadonlySet<number>): number {
  let dropped = 0
  for (const matchId of prevStates.keys()) {
    if (liveMatchIds.has(matchId)) continue
    prevStates.delete(matchId)
    dropped++
  }
  return dropped
}

/** Exported for tests — how many matches are currently being diffed. */
export function prevStateCount(): number {
  return prevStates.size
}

export interface WriteResult {
  matchId: number
  t: number
  minute: number
  events: number
}

export async function writeSnapshot(game: EnrichedLiveGame): Promise<WriteResult | null> {
  if (!db) return null
  const matchId = num(game.match_id)
  if (matchId === null) return null

  const facts = extractTimelineFacts(game)
  if (!facts) return null

  const radiantTeam = game.radiant_team as Rec | undefined
  const direTeam = game.dire_team as Rec | undefined
  const logos = game.team_logos ?? { radiant: null, dire: null }

  const wpInputs = extractScoreboardInputs(game as Rec)
  const winProb = { gold: computeGoldWinProb(wpInputs.goldDiff), estimate: computeEstWinProb(wpInputs) }

  const playerRows = extractPlayerFacts(game, facts.t)
  const events = detectEvents(prevStates.get(matchId), facts, playerRows)

  /**
   * One snapshot, one transaction.
   *
   * These five writes describe a single instant and used to be five independent
   * statements: a crash or a shutdown between them left a minute in match_timeline with no
   * players behind it, or bumped snapshot_count for a raw snapshot that was never stored.
   * Every reader tolerates holes, which is why this stayed invisible — but a recording
   * whose parts disagree is worse than one that is simply missing a tick, and the archive
   * is the thing the whole v2.0 milestone exists to trust.
   */
  await db.transaction(async (tx) => {
    // ─── matches ───────────────────────────────────────────────────────────────
    await tx
      .insert(matches)
      .values({
        matchId,
        leagueId: num(game.league_id),
        leagueName: game.league_name ?? null,
        radiantTeamId: num(radiantTeam?.team_id),
        direTeamId: num(direTeam?.team_id),
        radiantTeamName: typeof radiantTeam?.team_name === 'string' ? radiantTeam.team_name : null,
        direTeamName: typeof direTeam?.team_name === 'string' ? direTeam.team_name : null,
        radiantLogoUrl: logos.radiant,
        direLogoUrl: logos.dire,
        duration: facts.t,
        radiantScore: facts.radiantScore,
        direScore: facts.direScore,
        gameState: num(game.game_state),
        ingestStatus: 'live',
        firstSnapshotT: facts.t,
        lastSnapshotT: facts.t,
        snapshotCount: 1,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: matches.matchId,
        set: {
          leagueId: sql`coalesce(excluded.league_id, ${matches.leagueId})`,
          leagueName: sql`coalesce(excluded.league_name, ${matches.leagueName})`,
          radiantTeamId: sql`coalesce(excluded.radiant_team_id, ${matches.radiantTeamId})`,
          direTeamId: sql`coalesce(excluded.dire_team_id, ${matches.direTeamId})`,
          radiantTeamName: sql`coalesce(excluded.radiant_team_name, ${matches.radiantTeamName})`,
          direTeamName: sql`coalesce(excluded.dire_team_name, ${matches.direTeamName})`,
          radiantLogoUrl: sql`coalesce(excluded.radiant_logo_url, ${matches.radiantLogoUrl})`,
          direLogoUrl: sql`coalesce(excluded.dire_logo_url, ${matches.direLogoUrl})`,
          // Monotonic: a late-arriving stale tick must not rewind the clock or the score.
          duration: sql`greatest(coalesce(excluded.duration, 0), coalesce(${matches.duration}, 0))`,
          radiantScore: sql`greatest(coalesce(excluded.radiant_score, 0), coalesce(${matches.radiantScore}, 0))`,
          direScore: sql`greatest(coalesce(excluded.dire_score, 0), coalesce(${matches.direScore}, 0))`,
          gameState: sql`excluded.game_state`,
          firstSnapshotT: sql`least(coalesce(excluded.first_snapshot_t, 0), coalesce(${matches.firstSnapshotT}, 2147483647))`,
          lastSnapshotT: sql`greatest(coalesce(excluded.last_snapshot_t, 0), coalesce(${matches.lastSnapshotT}, 0))`,
          snapshotCount: sql`${matches.snapshotCount} + 1`,
          lastSeenAt: sql`excluded.last_seen_at`,
          // The way back from a premature close. `closeStaleLiveMatches` flips a row to
          // 'awaiting_parse' after four minutes without a Valve sighting, which is usually
          // the match ending — but a feed outage or a long technical pause looks identical,
          // and until now there was no edge back. The row stayed frozen for the rest of the
          // map: the score stopped moving, SeriesTabs showed it finished, and backfill
          // hammered OpenDota for a match that had not been played yet.
          // Whatever the reason, a match producing snapshots is being played.
          ingestStatus: sql`'live'`,
          // A row closed by mistake must not carry the retry budget it burned while closed.
          backfillAttempts: sql`0`,
          backfillNextAt: sql`null`,
        },
        // 'complete' and 'failed' are terminal states and are never touched.
        //
        // 'awaiting_parse' is revived ONLY when the game clock has actually MOVED past what
        // is stored. That is what separates the two cases that reach here: a genuinely
        // finished match can still be served once more from the 30s Valve cache, and that
        // late tick carries the same `t` it already wrote — no advance, no revival, no
        // ping-pong with the sweep. A match that was wrongly closed comes back with minutes
        // of new game time behind it.
        setWhere: sql`${matches.ingestStatus} = 'live'
          or (${matches.ingestStatus} = 'awaiting_parse'
              and coalesce(excluded.duration, 0) > coalesce(${matches.duration}, 0))`,
      })

    // ─── raw snapshot ──────────────────────────────────────────────────────────
    //
    // `history` is dropped before storing, and it is the only field that is.
    //
    // It is the Redis gold/XP series AS OF THIS TICK — so snapshot 2 holds two points,
    // snapshot 90 holds ninety, and the same series is written again, one point longer,
    // every thirty seconds. The cost is quadratic in the length of the match: a 45-minute
    // game stores roughly four thousand copies of points it already had, for a series the
    // archive is keeping properly in match_timeline anyway.
    //
    // Nothing reads it back: useMatchState prefers the per-minute rows and falls back to
    // the payload only when they are shorter, which is never true of a match that has been
    // recorded — the timeline row exists for every minute the snapshot does.
    const { history: _redisSeries, ...payload } = game

    await tx
      .insert(matchSnapshots)
      .values({
        matchId,
        t: facts.t,
        gameState: num(game.game_state),
        payload,
      })
      // Same game second = same state. Valve's feed can repeat a duration across ticks.
      .onConflictDoNothing({ target: [matchSnapshots.matchId, matchSnapshots.t] })

    // ─── per-minute derived ────────────────────────────────────────────────────
    await tx
      .insert(matchTimeline)
      .values({
        matchId,
        minute: facts.minute,
        radiantGoldAdv: facts.radiantGoldAdv,
        radiantXpAdv: facts.radiantXpAdv,
        radiantNetWorth: facts.radiantNetWorth,
        direNetWorth: facts.direNetWorth,
        radiantScore: facts.radiantScore,
        direScore: facts.direScore,
        radiantTowers: facts.radiantTowers,
        direTowers: facts.direTowers,
        radiantBarracks: facts.radiantBarracks,
        direBarracks: facts.direBarracks,
        roshanKills: facts.roshanKills,
        // Win-probability curve. Both heuristics are pure functions of the scoreboard,
        // so sampling them every tick is free. Stratz is deliberately NOT called here:
        // at 500 req/hr it cannot survive ~8 concurrent TI matches on a 30s tick, and
        // the live UI already fetches it through its own 60s cache.
        winProbGold: winProb.gold,
        winProbEstimate: winProb.estimate,
        source: 'live',
      })
      .onConflictDoUpdate({
        target: [matchTimeline.matchId, matchTimeline.minute],
        set: {
          radiantGoldAdv: sql`excluded.radiant_gold_adv`,
          radiantXpAdv: sql`excluded.radiant_xp_adv`,
          radiantNetWorth: sql`excluded.radiant_net_worth`,
          direNetWorth: sql`excluded.dire_net_worth`,
          radiantScore: sql`excluded.radiant_score`,
          direScore: sql`excluded.dire_score`,
          radiantTowers: sql`excluded.radiant_towers`,
          direTowers: sql`excluded.dire_towers`,
          radiantBarracks: sql`excluded.radiant_barracks`,
          direBarracks: sql`excluded.dire_barracks`,
          roshanKills: sql`excluded.roshan_kills`,
          winProbGold: sql`excluded.win_prob_gold`,
          winProbEstimate: sql`excluded.win_prob_estimate`,
        },
        // Never downgrade an OpenDota-sourced minute back to a sampled approximation.
        setWhere: sql`${matchTimeline.source} = 'live'`,
      })

    if (playerRows.length > 0) {
      await tx
        .insert(playerTimeline)
        .values(playerRows.map((p) => ({ matchId, minute: facts.minute, ...p, source: 'live' as const })))
        .onConflictDoUpdate({
          target: [playerTimeline.matchId, playerTimeline.minute, playerTimeline.playerSlot],
          set: {
            accountId: sql`excluded.account_id`,
            heroId: sql`excluded.hero_id`,
            team: sql`excluded.team`,
            playerName: sql`excluded.player_name`,
            netWorth: sql`excluded.net_worth`,
            xp: sql`excluded.xp`,
            level: sql`excluded.level`,
            kills: sql`excluded.kills`,
            deaths: sql`excluded.deaths`,
            assists: sql`excluded.assists`,
            lastHits: sql`excluded.last_hits`,
            denies: sql`excluded.denies`,
            gpm: sql`excluded.gpm`,
            xpm: sql`excluded.xpm`,
            items: sql`excluded.items`,
            positionX: sql`excluded.position_x`,
            positionY: sql`excluded.position_y`,
            ultimateState: sql`excluded.ultimate_state`,
            ultimateCooldown: sql`excluded.ultimate_cooldown`,
            respawnTimer: sql`excluded.respawn_timer`,
          },
          setWhere: sql`${playerTimeline.source} = 'live'`,
        })
    }

    // ─── events ────────────────────────────────────────────────────────────────
    if (events.length > 0) {
      await tx
        .insert(matchEvents)
        .values(events.map((e) => ({ matchId, t: e.t, type: e.type, team: e.team, payload: e.payload, dedupeKey: e.dedupeKey, source: 'live' as const })))
        .onConflictDoNothing({ target: [matchEvents.matchId, matchEvents.dedupeKey] })
      logger.info({ matchId, t: facts.t, events: events.map((e) => e.dedupeKey) }, 'archive: events detected')
    }
  })

  /**
   * The diff baseline advances only after the write COMMITTED.
   *
   * It used to be set before the events were inserted, so a failure at that point still
   * moved the baseline — and because the next tick diffs against it, the kills and towers
   * of that window were never detected again. Lost events are unrecoverable until the
   * replay is parsed; a repeated detection is not, because every event carries a dedupeKey.
   */
  prevStates.set(matchId, {
    t: facts.t,
    radiantTowers: facts.radiantTowers,
    direTowers: facts.direTowers,
    radiantBarracks: facts.radiantBarracks,
    direBarracks: facts.direBarracks,
    roshanKills: facts.roshanKills,
    players: new Map(
      playerRows.map((p) => [
        p.playerSlot,
        {
          heroId: p.heroId,
          playerName: p.playerName,
          team: p.team,
          kills: p.kills ?? 0,
          deaths: p.deaths ?? 0,
          assists: p.assists ?? 0,
        },
      ]),
    ),
  })

  return { matchId, t: facts.t, minute: facts.minute, events: events.length }
}
