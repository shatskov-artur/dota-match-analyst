import { z } from 'zod'

// CRITICAL: .passthrough() — OpenDota adds fields without notice.
// CRITICAL: all fields .optional() — avoid hard failures on partial responses.
export const LeagueSchema = z.object({
  leagueid: z.number().optional(),
  name: z.string().nullable().optional(),
  tier: z.string().optional(),
}).passthrough()

export type League = z.infer<typeof LeagueSchema>
