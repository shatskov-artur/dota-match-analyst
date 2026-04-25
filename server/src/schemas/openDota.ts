import { z } from 'zod'

// CRITICAL: .passthrough() — OpenDota adds fields without notice.
// CRITICAL: all fields .optional() — avoid hard failures on partial responses.
export const LeagueSchema = z.object({
  leagueid: z.number().optional(),
  name: z.string().nullable().optional(),
  tier: z.string().optional(),
}).passthrough()

export type League = z.infer<typeof LeagueSchema>

// Phase 5: Hero & Player Intel schemas
// All fields .optional() — OpenDota adds fields without notice.
// All schemas .passthrough() — preserve unknown fields silently.

// GET /api/heroStats — array of hero stat objects.
// CRITICAL: heroStats uses `id` field (not `hero_id`) for the hero identifier.
// Defensive: accept both `id` and `hero_id` (assumption A1 — verified on first API call).
export const HeroStatsSchema = z.object({
  id: z.number().optional(),          // primary field name in /api/heroStats
  hero_id: z.number().optional(),     // defensive fallback — accept either
  pro_win: z.number().optional(),
  pro_pick: z.number().optional(),
  pro_ban: z.number().optional(),
  localized_name: z.string().optional(),
}).passthrough()

export type HeroStats = z.infer<typeof HeroStatsSchema>

// GET /api/players/{accountId}/heroes — array of per-player hero stat objects.
// CRITICAL: hero_id may be string or number (Go SDK shows string — assumption A2).
export const PlayerHeroSchema = z.object({
  hero_id: z.union([z.string(), z.number()]).optional(),
  games: z.number().optional(),
  win: z.number().optional(),
  last_played: z.number().optional(),
}).passthrough()

export type PlayerHero = z.infer<typeof PlayerHeroSchema>

// GET /api/heroes/{heroId}/matchups — array of hero vs. hero matchup objects.
// CRITICAL: field may be `hero_id` (current) or `hero_id2` (older API version — assumption A3).
export const HeroMatchupSchema = z.object({
  hero_id: z.number().optional(),     // counter hero ID — current field name
  hero_id2: z.number().optional(),    // defensive fallback for older API version
  games_played: z.number().optional(),
  wins: z.number().optional(),
}).passthrough()

export type HeroMatchup = z.infer<typeof HeroMatchupSchema>

// Transformed shapes (server-computed, not raw API responses)
export interface HeroStatsEntry {
  win_rate: number
  pick_rate: number
}

export type HeroStatsMap = Record<number, HeroStatsEntry>

export interface CounterHeroEntry {
  heroId: number
  disadvantageScore: number
}

export interface PlayerHeroEntry {
  hero_id: number
  games: number
  win: number
}
