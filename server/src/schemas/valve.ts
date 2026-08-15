import { z } from 'zod'

// CRITICAL: .passthrough() on EVERY schema — Valve adds fields silently each patch.
// CRITICAL: ALL nested fields are .optional() — they are absent during lobby/pre-game states.

const PlayerSchema = z
  .object({
    account_id: z.number().optional(), // absent during draft pre-lock; 4294967295 = hidden profile (use hiddenProfile() guard)
    hero_id: z.number().optional(), // absent during draft pre-lock; map with heroMapper()
    name: z.string().optional(),
    team: z.number().int().optional(), // 0=Radiant, 1=Dire, 2=Broadcaster, 4=Unassigned
    kills: z.number().optional(),
    death: z.number().optional(),
    assists: z.number().optional(),
    net_worth: z.number().optional(),
    respawn_timer: z.number().optional(), // 0 when alive, >0 when dead
    // D-08: optional extended stats — present in-game via .passthrough(), absent during draft
    level: z.number().optional(),
    gpm: z.number().optional(),
    xpm: z.number().optional(),
    lh: z.number().optional(),     // last hits
    dn: z.number().optional(),     // denies
    // Phase 7: item slots — all optional, absent during draft phase
    // VERIFY at runtime: item_neutral field name (may differ from Valve docs — D-04)
    // VERIFY at runtime: item6/item7/item8 backpack presence in pro match live API (D-04)
    item0: z.number().optional(),
    item1: z.number().optional(),
    item2: z.number().optional(),
    item3: z.number().optional(),
    item4: z.number().optional(),
    item5: z.number().optional(),
    item_neutral: z.number().optional(), // neutral item slot — D-04 VERIFY field name
    item6: z.number().optional(),        // backpack slot 0 — D-04 VERIFY presence
    item7: z.number().optional(),        // backpack slot 1
    item8: z.number().optional(),        // backpack slot 2
    // Phase 8: ability cooldowns + map positions — all optional, absent during draft.
    // VERIFIED 2026-04-28 against real GetLiveLeagueGames payload: field names are
    // position_x / position_y (NOT x_pos / y_pos as in earlier ROADMAP/CONTEXT drafts).
    position_x: z.number().optional(),         // float, range ~±8192, centered at 0
    position_y: z.number().optional(),         // float, range ~±8192, +Y = North (Y-flip required for SVG)
    ultimate_state: z.number().int().optional(), // 0=unavail/dead, 1=ready, 2=cooldown, 3=charging
    ultimate_cooldown: z.number().optional(),  // seconds remaining
  })
  .passthrough()

const TeamSchema = z
  .object({
    team_name: z.string().optional(),
    team_id: z.number().optional(),
    team_logo: z.union([z.string(), z.number()]).optional(), // Valve sends ugcid (number), not a URL
    complete: z.boolean().optional(),
  })
  .passthrough()

// D-17: Live-draft scoreboard shape verified against real GetLiveLeagueGames payload (2026-04-24).
// CRITICAL: picks/bans are nested under scoreboard.{radiant,dire} — NOT a flat top-level picks_bans array.
// CRITICAL: .passthrough() on EVERY sub-schema — Valve adds fields silently each patch.
// CRITICAL: All nested fields .optional() — absent in lobby / pre-draft states.
const DraftItemSchema = z
  .object({
    hero_id: z.number().optional(), // optional per PF-8 — picks pre-lock may arrive without it
  })
  .passthrough()

const TeamScoreboardSchema = z
  .object({
    picks: z.array(DraftItemSchema).optional(),
    bans: z.array(DraftItemSchema).optional(),
    // score, tower_state, barracks_state, heroes — all pass through silently (Phase 4 does not type them)
  })
  .passthrough()

const ScoreboardSchema = z
  .object({
    radiant: TeamScoreboardSchema.optional(),
    dire: TeamScoreboardSchema.optional(),
    // Phase 9: Roshan respawn timer (seconds). 0 = alive, >0 = dead.
    // Optional because Valve omits scoreboard fields entirely outside game_state===5.
    roshan_respawn_timer: z.number().optional(),
    // duration is also surfaced here for live.ts:58 — typing it eliminates one more cast.
    duration: z.number().optional(),
  })
  .passthrough()

export const LiveGameSchema = z
  .object({
    match_id: z.number(),
    lobby_id: z.number(),
    league_id: z.number(),
    game_state: z.number().int().optional(), // 2=draft, 5=in-game, 6=post-game — see RESEARCH.md
    stream_delay_s: z.number().optional(), // typically 120 (2 min delay)
    spectators: z.number().optional(),
    radiant_score: z.number().optional(),
    dire_score: z.number().optional(),
    duration: z.number().optional(), // seconds elapsed
    tower_state: z.number().optional(), // 32-bit bitmask → use buildingDecoder()
    barracks_state: z.number().optional(), // 8-bit bitmask → use buildingDecoder()
    building_state: z.number().optional(), // alternate field name in some API versions
    radiant_series_wins: z.number().optional(),
    dire_series_wins: z.number().optional(),
    series_type: z.number().optional(), // 0=BO1, 1=BO3, 2=BO5
    players: z.array(PlayerSchema).optional(),
    scoreboard: ScoreboardSchema.optional(),
    radiant_team: TeamSchema.optional(),
    dire_team: TeamSchema.optional(),
  })
  .passthrough() // CRITICAL: never remove .passthrough()

/**
 * ISteamRemoteStorage/GetUGCFileDetails/v1 — resolves a Workshop `ugcid` to a public asset URL.
 * Used as the fallback source for team logos when OpenDota does not know the team.
 * `data` is absent when the ugcid is unknown; `url` is the only field this project reads.
 */
export const UgcFileDetailsSchema = z
  .object({
    data: z
      .object({
        url: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

export const LiveLeagueGamesSchema = z
  .object({
    result: z
      .object({
        // Optional, matching what the callers already assume. Every reader writes
        // `games ?? []` — a defence that could never fire while the schema demanded the
        // field, because .parse() would have thrown first. That mismatch had one outcome:
        // if Valve ever omits `games` on a quiet night, the ZodError is not a 429, so
        // cached() does not retry it, /api/live/games answers 503, and the ingest tick
        // logs a failure — the whole app dark because nothing was being played.
        games: z.array(LiveGameSchema).optional(),
        status: z.number().optional(),
      })
      .passthrough(),
  })
  .passthrough()

export type LiveGame = z.infer<typeof LiveGameSchema>
export type LiveLeagueGames = z.infer<typeof LiveLeagueGamesSchema>
