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
export const RoshanKillSchema = z.object({
  /** Which Roshan of the match this was — 1-based, and what picks the loot table. */
  n: z.number().int().positive(),
  /** Game seconds at the kill, never wall clock. */
  gameTime: z.number().int().nonnegative(),
  loot: z.array(z.number().int()),
})

export const RoshanStateSchema = z.object({
  killCount: z.number().int().nonnegative(),
  alive: z.boolean(),
  respawnIn: z.number().nullable(),
  lastKillLoot: z.array(z.number().int()).nullable(),
  /**
   * Every Roshan of the match in order, so the page can say WHEN each died rather than
   * only how many there were. Survives a server restart: the sampler recovers the history
   * from match_events when Redis has been cleared.
   */
  kills: z.array(RoshanKillSchema),
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

/**
 * Team logo URLs resolved server-side (OpenDota primary, Valve UGC fallback).
 * Null per side when the team is TBD, unknown upstream, or has never uploaded a logo —
 * the client renders an initials monogram in that case, never a broken image.
 * Kept as a separate field rather than mutated into Valve's radiant_team/dire_team, which
 * arrive under .passthrough() and should stay a faithful copy of the upstream shape.
 */
export const TeamLogosSchema = z.object({
  radiant: z.string().nullable(),
  dire: z.string().nullable(),
})

export const EnrichedLiveGameSchema = LiveGameSchema.extend({
  league_name: z.string(),  // never null at client boundary — fallback applied server-side
  /**
   * OpenDota's tier name for the league, or null when OpenDota does not carry it.
   * Nullable rather than defaulted: "we don't know" and "amateur" are different claims,
   * and the home page's tier filter shows the first as Other rather than as a verdict.
   */
  league_tier: z.string().nullable(),
  roshan: RoshanStateSchema.nullable(),
  history: z.array(HistorySampleSchema),  // always an array (empty when redis miss or no samples yet)
  team_logos: TeamLogosSchema,  // always present; either side may be null
})

export const LiveGamesResponseSchema = z.object({
  games: z.array(EnrichedLiveGameSchema),
})

export type RoshanState = z.infer<typeof RoshanStateSchema>
export type TeamLogos = z.infer<typeof TeamLogosSchema>
export type HistorySample = z.infer<typeof HistorySampleSchema>
export type EnrichedLiveGame = z.infer<typeof EnrichedLiveGameSchema>
export type LiveGamesResponse = z.infer<typeof LiveGamesResponseSchema>
