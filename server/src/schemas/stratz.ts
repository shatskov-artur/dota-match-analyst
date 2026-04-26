import { z } from 'zod'

// CRITICAL: .passthrough() — Stratz adds fields without notice (CLAUDE.md §Key Patterns).
// CRITICAL: all fields .optional() — avoid hard failures on partial responses.
// CRITICAL: field names are camelCase (GraphQL JSON) — NOT PascalCase (C# models).
// NOTE: heroVsHeroMatchup structure is nested (not flat) — C# analysis Finding 3.
//       advantage[].heroId = opponent hero; advantage[].vs[].winRateHeroId1 = our hero win rate.

// ─── Win Probability ──────────────────────────────────────────────────────────

export const StratzWinRateDetailSchema = z.object({
  time: z.number().optional(),
  winRate: z.number().optional(),
}).passthrough()

export const StratzWinProbResponseSchema = z.object({
  data: z.object({
    live: z.object({
      match: z.object({
        liveWinRateValues: z.array(StratzWinRateDetailSchema).optional(),
      }).passthrough().optional().nullable(),
    }).passthrough().optional(),
  }).passthrough().optional(),
}).passthrough()

// ─── Hero Matchups ────────────────────────────────────────────────────────────
// NOTE: field names [ASSUMED camelCase] — verify vs actual JSON on first API call.
// If parse failures appear, check server logs for '[stratzApi] StratzMatchupSchema parse failure'.

export const StratzHeroVsHeroEntrySchema = z.object({
  heroId1: z.number().optional(),
  heroId2: z.number().optional(),
  winRateHeroId1: z.number().optional(),
  winRateHeroId2: z.number().optional(),
  matchCount: z.number().optional(),
  winCount: z.number().optional(),
}).passthrough()

export const StratzHeroDryadSchema = z.object({
  heroId: z.number().optional(),
  vs: z.array(StratzHeroVsHeroEntrySchema).optional(),
}).passthrough()

export const StratzMatchupResponseSchema = z.object({
  data: z.object({
    heroStats: z.object({
      heroVsHeroMatchup: z.object({
        advantage: z.array(StratzHeroDryadSchema).optional(),
        disadvantage: z.array(StratzHeroDryadSchema).optional(),
      }).passthrough().optional(),
    }).passthrough().optional(),
  }).passthrough().optional(),
}).passthrough()

// ─── Inferred types (used in service layer) ───────────────────────────────────
export type StratzHeroDryadEntry = z.infer<typeof StratzHeroDryadSchema>
export type StratzHeroVsHeroEntry = z.infer<typeof StratzHeroVsHeroEntrySchema>
