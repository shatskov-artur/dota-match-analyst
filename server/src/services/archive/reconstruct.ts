import { and, asc, desc, eq, lte, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { matches, matchTimeline, playerTimeline, matchEvents, postMatchRaw } from '../../db/schema.js'
import { heroMapper } from '../../../../shared/heroMapper.js'
import { packBuildingState } from '../../../../shared/buildingDecoder.js'
import { lookupRoshanLoot } from '../../../../shared/roshanLoot.js'

/**
 * Rebuild "what the game looked like at minute N" for a match nobody watched live.
 *
 * A match recorded by the sampler has a raw snapshot per 30 seconds and time travel is a
 * lookup. A match recovered afterwards from OpenDota has no snapshots at all, and until
 * this existed `/at` answered 404 — so the match page rendered with `match === undefined`
 * and every panel that reads it (score header, hero grid, buildings, Roshan) came out
 * blank. Nothing was missing from the page; there was nothing to put in it.
 *
 * The archive does hold the ingredients, they were simply never read back:
 *   player_timeline  — hero, name, net worth, XP and last hits for all ten, every minute
 *   match_timeline   — score and the gold/XP lead, every minute
 *   match_events     — the exact kill log and every building that fell, to the second
 *
 * The output is deliberately the SAME shape as one element of /api/live/games, which is
 * what lets the whole match page render it without a single component change.
 *
 * Item slots come from the stored OpenDota body, which records each player's FINAL six
 * items. That is exact, but it is the end of the match rather than the minute on screen —
 * the replay exposes no per-minute inventory, and reconstructing one from the purchase log
 * would mean simulating every recipe, sale and drop to produce a guess. So the final build
 * is shown as the final build, flagged `itemsAreFinal`, and the page says which it is.
 *
 * Assists are a special case. The replay records no per-minute assist count anywhere —
 * the kill log names a killer and a victim and nobody else — but it does carry the match
 * TOTAL. At the final minute those two are the same number, so assists are filled in there
 * and left blank on every earlier minute. That is not a compromise: at 40:00 of a
 * 40-minute game "17 assists" is simply true, and at 20:00 it would be a lie.
 *
 * What cannot be rebuilt at all, because Valve only publishes it live: ability cooldowns
 * and hero positions. Those stay absent rather than guessed, and the response is flagged
 * `reconstructed` so the UI can say so.
 */

/**
 * Cumulative XP required for each level, index 0 = level 1.
 * Copied from dotaconstants' xp_level (a root devDependency, not available at runtime).
 * player_timeline stores raw XP because that is what OpenDota's per-minute array carries.
 */
const XP_PER_LEVEL = [
  0, 240, 640, 1160, 1760, 2440, 3200, 4000, 4900, 5900, 7000, 8200, 9500, 10900, 12400,
  14000, 15700, 17500, 19400, 21400, 23600, 26000, 28600, 31400, 34400, 38400, 43400,
  49400, 56400, 63900,
]

export function levelFromXp(xp: number | null): number | undefined {
  if (xp === null || !Number.isFinite(xp)) return undefined
  let level = 1
  for (let i = 1; i < XP_PER_LEVEL.length; i++) if (xp >= XP_PER_LEVEL[i]) level = i + 1
  return level
}

/**
 * hero_id → the npc name OpenDota puts in a kill log entry.
 *
 * Derived from the portrait filename in shared/heroes.json, which IS the npc suffix —
 * Nature's Prophet is `furion.png` and `npc_dota_hero_furion`. Deriving it beats a second
 * hand-maintained table that would drift from the first.
 */
const npcNameCache = new Map<number, string | null>()
export function npcNameForHero(heroId: number): string | null {
  const cached = npcNameCache.get(heroId)
  if (cached !== undefined) return cached
  const slug = /heroes\/([^/]+)\.png/.exec(heroMapper(heroId)?.portrait ?? '')?.[1] ?? null
  const name = slug ? `npc_dota_hero_${slug}` : null
  npcNameCache.set(heroId, name)
  return name
}

/** Tower bit positions within one team's 16-bit half, matching buildingDecoder. */
const TOWER_BIT: Record<string, number> = {
  top_T1: 0, top_T2: 1, top_T3: 2,
  mid_T1: 3, mid_T2: 4, mid_T3: 5,
  bot_T1: 6, bot_T2: 7, bot_T3: 8,
  ancient_T4a: 9, ancient_T4b: 10,
}
/** Barracks bit positions within one team's 8-bit half. */
const RAX_BIT: Record<string, number> = {
  top_melee: 0, top_ranged: 1,
  mid_melee: 2, mid_ranged: 3,
  bot_melee: 4, bot_ranged: 5,
}

interface BuildingEventPayload {
  side?: string
  lane?: string | null
  tier?: string | null
  kind?: string
}

/**
 * The two writers speak different dialects about the same event, and this reads both.
 *
 *   live  (snapshotWriter.detectEvents)  tower   { side, lane, tier: 'tier1' }   — no kind
 *                                        barracks{ side, lane, kind: 'meleeRax' } — no tier
 *   od    (postMatchBackfill)            tower   { side, lane, tier: 'T1', kind: 'tower' }
 *                                        barracks{ side, lane, tier: 'melee', kind: 'barracks' }
 *
 * Reading only the second dialect meant every live-recorded building event was silently
 * skipped here — the loop below matches on `kind === 'tower' | 'barracks'`, which a live
 * row never carries. In practice the two writers run together, so a match reaching
 * reconstruction usually has only `od:` rows; but "usually" is not a reason for a reader
 * to understand half its own table, and a partially written snapshot (see D-3) produces
 * exactly the mix that used to be dropped.
 *
 * Normalising on READ rather than changing what is written keeps every row already in the
 * archive readable.
 */
function normalizeBuilding(p: BuildingEventPayload): { kind: 'tower' | 'barracks'; lane: string | null; tier: string | null } | null {
  const lane = p.lane ?? null

  // Barracks: 'barracks' (od) or 'meleeRax' / 'rangedRax' (live).
  if (p.kind === 'barracks') return { kind: 'barracks', lane, tier: p.tier ?? null }
  if (p.kind === 'meleeRax') return { kind: 'barracks', lane, tier: 'melee' }
  if (p.kind === 'rangedRax') return { kind: 'barracks', lane, tier: 'ranged' }

  // Towers: 'tower' (od, tier 'T1'…'T4') or no kind at all (live, tier 'tier1'…'tier4').
  if (p.kind === 'tower') return { kind: 'tower', lane, tier: p.tier ?? null }
  const liveTier = /^tier([1-4])$/.exec(p.tier ?? '')
  if (liveTier) return { kind: 'tower', lane, tier: `T${liveTier[1]}` }

  return null
}

/**
 * Replay the building kills up to `upperT` into the two bitmasks the decoder expects.
 *
 * Starts from "everything standing" and clears a bit per destroyed building, which is the
 * only direction this can go — buildings do not come back.
 *
 * The two tier-4 towers share a lane ("ancient") and are indistinguishable in the
 * objective log, so the first one seen clears the first bit and the second the other.
 */
export function replayBuildings(
  events: Array<{ type: string; t: number; payload: unknown }>,
  upperT: number,
): { towerState: number; barracksState: number } {
  let radiantTowers = 0x7ff
  let direTowers = 0x7ff
  let radiantRax = 0x3f
  let direRax = 0x3f
  const t4Seen = { radiant: 0, dire: 0 }

  for (const e of events) {
    if (e.t > upperT) continue
    if (e.type !== 'tower' && e.type !== 'barracks' && e.type !== 'building') continue
    const raw = (e.payload ?? {}) as BuildingEventPayload
    const side = raw.side === 'radiant' ? 'radiant' : raw.side === 'dire' ? 'dire' : null
    if (!side) continue
    const p = normalizeBuilding(raw)
    if (!p) continue

    if (p.kind === 'barracks' && p.lane && p.tier) {
      const bit = RAX_BIT[`${p.lane}_${p.tier}`]
      if (bit === undefined) continue
      if (side === 'radiant') radiantRax &= ~(1 << bit)
      else direRax &= ~(1 << bit)
      continue
    }
    if (p.kind === 'tower') {
      let key: string | undefined
      if (p.lane === 'ancient' || p.tier === 'T4') {
        key = t4Seen[side] === 0 ? 'ancient_T4a' : 'ancient_T4b'
        t4Seen[side]++
      } else if (p.lane && p.tier) {
        key = `${p.lane}_${p.tier}`
      }
      const bit = key ? TOWER_BIT[key] : undefined
      if (bit === undefined) continue
      if (side === 'radiant') radiantTowers &= ~(1 << bit)
      else direTowers &= ~(1 << bit)
    }
  }

  // Same packer the live path uses, so a reconstructed minute and a recorded one cannot
  // disagree about the layout. Never undefined here: the replay starts from "all standing".
  const packed = packBuildingState(radiantTowers, direTowers, radiantRax, direRax)
  return { towerState: packed.towerState as number, barracksState: packed.barracksState as number }
}

/** Roshan can be down for 8 to 11 minutes; only past 11 is he certainly back. */
const ROSHAN_MAX_RESPAWN = 11 * 60

export interface ReconstructedGame {
  match_id: number
  league_id: number
  league_name: string
  game_state: number
  duration: number
  radiant_score?: number
  dire_score?: number
  tower_state: number
  barracks_state: number
  roshan: {
    killCount: number
    alive: boolean
    respawnIn: number | null
    lastKillLoot: number[] | null
    /** Same shape the live path emits, so the page renders both without knowing which. */
    kills: Array<{ n: number; gameTime: number; loot: number[] }>
  } | null
  radiant_team?: { team_name?: string }
  dire_team?: { team_name?: string }
  team_logos?: { radiant: string | null; dire: string | null }
  players: Array<Record<string, unknown>>
}

export interface ReconstructResult {
  minute: number
  t: number
  /** Item slots are the match's final build, not the inventory at this minute. */
  itemsAreFinal: boolean
  /** Assists are only known at the end of the match, so only filled there. */
  assistsKnown: boolean
  game: ReconstructedGame
}

/** Final six slots plus the neutral, keyed by the archive's 0-9 player slot. */
type FinalItems = Map<number, Record<string, number>>

/**
 * Match-total assists per player, keyed by the archive's 0-9 slot.
 *
 * Only ever applied to the last minute of the match — see the note at the top of the file.
 */
export function finalAssistsFrom(raw: unknown): Map<number, number> {
  const out = new Map<number, number>()
  const players = (raw as { players?: unknown })?.players
  if (!Array.isArray(players)) return out
  for (const p of players) {
    const player = p as Record<string, unknown>
    const rawSlot = typeof player.player_slot === 'number' ? player.player_slot : null
    const assists = typeof player.assists === 'number' ? player.assists : null
    if (rawSlot === null || assists === null) continue
    const slot = rawSlot < 128 ? rawSlot : 5 + (rawSlot - 128)
    if (slot >= 0 && slot <= 9) out.set(slot, assists)
  }
  return out
}

/**
 * Read each player's finished inventory out of the stored OpenDota body.
 *
 * player_slot is normalised from Valve's encoding (0-4 Radiant, 128-132 Dire) to the
 * archive's 0-9, the same way the backfill does it, so the two line up.
 */
export function finalItemsFrom(raw: unknown): FinalItems {
  const out: FinalItems = new Map()
  const players = (raw as { players?: unknown })?.players
  if (!Array.isArray(players)) return out
  for (const p of players) {
    const player = p as Record<string, unknown>
    const rawSlot = typeof player.player_slot === 'number' ? player.player_slot : null
    if (rawSlot === null) continue
    const slot = rawSlot < 128 ? rawSlot : 5 + (rawSlot - 128)
    if (slot < 0 || slot > 9) continue
    const items: Record<string, number> = {}
    for (let i = 0; i < 6; i++) {
      const v = player[`item_${i}`]
      if (typeof v === 'number' && v > 0) items[`item${i}`] = v
    }
    const neutral = player.item_neutral
    if (typeof neutral === 'number' && neutral > 0) items.item_neutral = neutral
    if (Object.keys(items).length > 0) out.set(slot, items)
  }
  return out
}

export async function reconstructAt(matchId: number, upperT: number): Promise<ReconstructResult | null> {
  if (!db) return null

  const [row] = await db.select().from(matches).where(eq(matches.matchId, matchId)).limit(1)
  if (!row) return null

  const upperMinute = Math.floor(upperT / 60)

  // The latest minute we hold at or before the requested one. Never interpolates: a
  // reconstructed minute is still a minute that actually happened.
  const [atMinute] = await db
    .select({ minute: playerTimeline.minute })
    .from(playerTimeline)
    .where(and(eq(playerTimeline.matchId, matchId), lte(playerTimeline.minute, upperMinute)))
    .orderBy(desc(playerTimeline.minute))
    .limit(1)

  // Before the first stored minute, fall back to the earliest — same rule the snapshot
  // path uses, so the two behave alike at the start of a game.
  const [earliest] = atMinute
    ? [atMinute]
    : await db
        .select({ minute: playerTimeline.minute })
        .from(playerTimeline)
        .where(eq(playerTimeline.matchId, matchId))
        .orderBy(asc(playerTimeline.minute))
        .limit(1)
  const minute = earliest?.minute
  if (minute === undefined) return null

  const [lastRow] = await db
    .select({ minute: playerTimeline.minute })
    .from(playerTimeline)
    .where(eq(playerTimeline.matchId, matchId))
    .orderBy(desc(playerTimeline.minute))
    .limit(1)
  const isFinalMinute = lastRow !== undefined && minute === lastRow.minute

  const [playerRows, timelineRow, events, rawRow] = await Promise.all([
    db
      .select()
      .from(playerTimeline)
      .where(and(eq(playerTimeline.matchId, matchId), eq(playerTimeline.minute, minute)))
      .orderBy(asc(playerTimeline.playerSlot)),
    db
      .select()
      .from(matchTimeline)
      .where(and(eq(matchTimeline.matchId, matchId), eq(matchTimeline.minute, minute)))
      .limit(1)
      .then((r) => r[0]),
    db
      .select({ type: matchEvents.type, t: matchEvents.t, payload: matchEvents.payload })
      .from(matchEvents)
      .where(and(eq(matchEvents.matchId, matchId), lte(matchEvents.t, sql`${minute * 60 + 59}`)))
      .orderBy(asc(matchEvents.t)),
    db
      .select({ opendota: postMatchRaw.opendota })
      .from(postMatchRaw)
      .where(eq(postMatchRaw.matchId, matchId))
      .limit(1)
      .then((r) => r[0]),
  ])
  if (playerRows.length === 0) return null

  const finalItems = finalItemsFrom(rawRow?.opendota)
  // Only at the end of the match is the match total also this minute's total.
  const finalAssists = isFinalMinute ? finalAssistsFrom(rawRow?.opendota) : new Map<number, number>()

  const cutoff = minute * 60 + 59
  const { towerState, barracksState } = replayBuildings(events, cutoff)

  // Kills and deaths from the exact kill log. Assists are not in it, so they stay absent
  // rather than being shown as zero — a zero there would read as "no assists".
  const kills = new Map<number, number>()
  const deathsByNpc = new Map<string, number>()
  for (const e of events) {
    if (e.type !== 'kill') continue
    const p = (e.payload ?? {}) as { killerSlot?: number; victimHero?: string | null }
    if (typeof p.killerSlot === 'number') kills.set(p.killerSlot, (kills.get(p.killerSlot) ?? 0) + 1)
    if (p.victimHero) deathsByNpc.set(p.victimHero, (deathsByNpc.get(p.victimHero) ?? 0) + 1)
  }

  const roshanKills = events.filter((e) => e.type === 'roshan')
  const lastRoshanT = roshanKills.length > 0 ? roshanKills[roshanKills.length - 1].t : null
  const sinceRoshan = lastRoshanT === null ? null : cutoff - lastRoshanT

  const players = playerRows.map((p) => {
    const npc = p.heroId ? npcNameForHero(p.heroId) : null
    return {
      account_id: p.accountId ?? undefined,
      hero_id: p.heroId ?? undefined,
      name: p.playerName ?? undefined,
      team: p.team ?? undefined,
      net_worth: p.netWorth ?? undefined,
      level: levelFromXp(p.xp),
      lh: p.lastHits ?? undefined,
      dn: p.denies ?? undefined,
      // GPM and XPM are averages over the match so far, which is exactly what the columns
      // mean — net worth and XP at this minute divided by the minutes played. Minute 0 has
      // no elapsed time to divide by, so it stays absent rather than dividing by zero.
      gpm: minute > 0 && p.netWorth !== null ? Math.round(p.netWorth / minute) : undefined,
      xpm: minute > 0 && p.xp !== null ? Math.round(p.xp / minute) : undefined,
      /*
       * The exact kill log first, the recorded counters second, and NOTHING rather than a
       * zero when neither exists.
       *
       * `?? 0` asserted a fact the archive did not have: a match whose replay carries no
       * kills_log (unparsed, or an older match) produced an empty event map, and every
       * player was rendered as having gone 0/0 — indistinguishable from a real 0/0, and
       * wrong. player_timeline already holds kills and deaths whenever the live sampler
       * recorded them; those columns were selected and then never read.
       */
      kills: kills.get(p.playerSlot) ?? p.kills ?? undefined,
      death: (npc ? deathsByNpc.get(npc) : undefined) ?? p.deaths ?? undefined,
      assists: finalAssists.get(p.playerSlot),
      ...(finalItems.get(p.playerSlot) ?? {}),
    }
  })

  return {
    minute,
    t: cutoff,
    itemsAreFinal: finalItems.size > 0,
    assistsKnown: finalAssists.size > 0,
    game: {
      match_id: matchId,
      league_id: row.leagueId ?? 0,
      league_name: row.leagueName ?? '',
      // 5 = in game. A reconstructed minute is a moment DURING the match, not after it,
      // and the match page unlocks the buildings / map / graph row on this value — the
      // same way it does when scrubbing a live-recorded game. 6 would be true of the
      // match as a whole and wrong about the minute being shown.
      game_state: 5,
      duration: minute * 60,
      radiant_score: timelineRow?.radiantScore ?? undefined,
      dire_score: timelineRow?.direScore ?? undefined,
      tower_state: towerState,
      barracks_state: barracksState,
      roshan:
        lastRoshanT === null
          ? { killCount: 0, alive: true, respawnIn: null, lastKillLoot: null, kills: [] }
          : {
              killCount: roshanKills.length,
              // 8-11 minutes; only past the upper bound is he certainly back up, and the
              // objective log gives no way to narrow it, so respawnIn stays unknown.
              alive: (sinceRoshan ?? 0) >= ROSHAN_MAX_RESPAWN,
              respawnIn: null,
              lastKillLoot: [...lookupRoshanLoot(roshanKills.length)],
              // A reconstructed minute knows the timings exactly — they come from the same
              // event log this is rebuilt from — so the history is as good here as live.
              kills: roshanKills.map((e, i) => ({
                n: i + 1,
                gameTime: e.t,
                loot: [...lookupRoshanLoot(i + 1)],
              })),
            },
      radiant_team: row.radiantTeamName ? { team_name: row.radiantTeamName } : undefined,
      dire_team: row.direTeamName ? { team_name: row.direTeamName } : undefined,
      team_logos: { radiant: row.radiantLogoUrl ?? null, dire: row.direLogoUrl ?? null },
      players,
    },
  }
}
