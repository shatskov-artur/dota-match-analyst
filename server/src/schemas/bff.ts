import { z } from 'zod'
import { LiveGameSchema } from './valve.js'

export const EnrichedLiveGameSchema = LiveGameSchema.extend({
  league_name: z.string(),  // never null at client boundary — fallback applied server-side
})

export const LiveGamesResponseSchema = z.object({
  games: z.array(EnrichedLiveGameSchema),
})

export type EnrichedLiveGame = z.infer<typeof EnrichedLiveGameSchema>
export type LiveGamesResponse = z.infer<typeof LiveGamesResponseSchema>
