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
    radiant_team: TeamSchema.optional(),
    dire_team: TeamSchema.optional(),
  })
  .passthrough() // CRITICAL: never remove .passthrough()

export const LiveLeagueGamesSchema = z
  .object({
    result: z
      .object({
        games: z.array(LiveGameSchema),
        status: z.number().optional(),
      })
      .passthrough(),
  })
  .passthrough()

export type LiveGame = z.infer<typeof LiveGameSchema>
export type LiveLeagueGames = z.infer<typeof LiveLeagueGamesSchema>
