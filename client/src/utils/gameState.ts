/**
 * Maps Valve game_state integer to display label.
 *
 * Known Valve states:
 *  0–1  INIT / WAIT_FOR_PLAYERS   → 'Waiting'
 *  2    HERO_SELECTION             → 'Draft'
 *  3    STRATEGY_TIME              → 'Strategy'
 *  4    PRE_GAME                   → 'Starting'
 *  5    GAME_IN_PROGRESS           → 'Live'
 *  6    POST_GAME                  → 'Post-game'
 *  8    TEAM_SHOWCASE              → 'Break'  (between games in a series)
 *
 * Fallback when game_state is absent: inspect scoreboard content.
 * - radiant.players[] non-empty → in-game → 'Live'
 * - scoreboard present but no players (picks/bans only) → 'Draft'
 */
export function getStatusLabel(
  gameState: number | undefined,
  scoreboard?: object | null,
): 'Draft' | 'Live' | 'Post-game' | 'Strategy' | 'Starting' | 'Waiting' | 'Break' | 'Unknown' {
  if (gameState === 0 || gameState === 1) return 'Waiting'
  if (gameState === 2) return 'Draft'
  if (gameState === 3) return 'Strategy'
  if (gameState === 4) return 'Starting'
  if (gameState === 5) return 'Live'
  if (gameState === 6) return 'Post-game'
  if (gameState === 8) return 'Break'
  if (gameState !== undefined) return 'Unknown'
  // game_state absent — infer from scoreboard
  if (scoreboard != null) {
    const sb = scoreboard as Record<string, unknown>
    const radiant = sb.radiant as Record<string, unknown> | undefined
    const hasPlayers = Array.isArray(radiant?.players) && (radiant.players as unknown[]).length > 0
    return hasPlayers ? 'Live' : 'Draft'
  }
  return 'Unknown'
}

/**
 * Maps Valve series_type integer to display format string.
 * Per D-03: 0=Bo1, 1=Bo3, 2=Bo5. Any other value → '' (empty, omit series label).
 */
export function getSeriesLabel(seriesType: number | undefined): string {
  if (seriesType === 0) return 'Bo1'
  if (seriesType === 1) return 'Bo3'
  if (seriesType === 2) return 'Bo5'
  return ''
}
