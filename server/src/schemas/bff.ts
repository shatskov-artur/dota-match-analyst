import { z } from 'zod'
import { LiveGameSchema } from './valve.js'

/**
 * Phase 9 Roshan response shape (D-19).
 * Null when the match has no scoreboard yet (pre-game).
 * Otherwise:
 *   - killCount: count of inferred Roshan kills so far
 *   - alive: true when respawn_timer === 0
 *   - respawnIn: seconds until respawn (null when alive)
 *   - lastKillLoot: item-id array dropped on the most recent kill (null when killCount === 0)
 */
export const RoshanStateSchema = z.object({
  killCount: z.number().int().nonnegative(),
  alive: z.boolean(),
  respawnIn: z.number().nullable(),
  lastKillLoot: z.array(z.number().int()).nullable(),
})

/**
 * Phase 10 history sample shape (D-07, D-16).
 *   - t: game-clock seconds (nonnegative integer)
 *   - gold: signed integer; Radiant-positive (sumNwR - sumNwD)
 *   - xp:   signed integer; Radiant-positive (round(teamXpR - teamXpD))
 * BFF-internal — never .passthrough()'d (this is not a Valve schema).
 */
export const HistorySampleSchema = z.object({
  t: z.number().int().nonnegative(),
  gold: z.number().int(),
  xp: z.number().int(),
})

export const EnrichedLiveGameSchema = LiveGameSchema.extend({
  league_name: z.string(),  // never null at client boundary — fallback applied server-side
  roshan: RoshanStateSchema.nullable(),
  history: z.array(HistorySampleSchema),  // always an array (empty when redis miss or no samples yet)
})

export const LiveGamesResponseSchema = z.object({
  games: z.array(EnrichedLiveGameSchema),
})

export type RoshanState = z.infer<typeof RoshanStateSchema>
export type HistorySample = z.infer<typeof HistorySampleSchema>
export type EnrichedLiveGame = z.infer<typeof EnrichedLiveGameSchema>
export type LiveGamesResponse = z.infer<typeof LiveGamesResponseSchema>
