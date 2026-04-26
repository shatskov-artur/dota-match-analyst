export interface WinProbBarProps {
  /** Stratz Radiant win probability ∈ [0, 1]; null = hide entire component (D-13) */
  radiantWinProb: number | null
  /** match.duration from Valve payload in seconds. CRITICAL: NOT match.game_time (field does not exist). */
  gameDuration: number | undefined
  /** match.game_state from Valve payload */
  gameState: number | undefined
}

/**
 * Radiant/Dire win probability gradient bar.
 * Self-gates: returns null when conditions are not met (D-06).
 * Render conditions: gameState===5 AND gameDuration>300 AND radiantWinProb!==null.
 * No placeholder, no error, no skeleton — silent hide (D-13).
 */
export default function WinProbBar({ radiantWinProb, gameDuration, gameState }: WinProbBarProps) {
  // D-06: hide when not in-game, early-game, or Stratz unavailable
  if (gameState !== 5 || (gameDuration ?? 0) <= 300 || radiantWinProb === null) {
    return null
  }

  const radiantPct = Math.round(radiantWinProb * 100)
  const direPct = 100 - radiantPct

  // Accessibility: prefers-reduced-motion
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <div
      className="w-full py-4"
      style={{ borderBottom: '1px solid #1a1a1a' }}
    >
      {/* Bar row: percentage label — bar fill — percentage label */}
      <div className="flex items-center gap-4">
        {/* Left: Radiant percentage */}
        <span
          className="text-xs font-bold tabular-nums shrink-0"
          style={{ color: '#4ade80', minWidth: 32, textAlign: 'right' }}
        >
          {radiantPct}%
        </span>

        {/* Bar fill — gradient with hard color stop at radiantPct% */}
        <div
          role="progressbar"
          aria-valuenow={radiantPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Radiant win probability"
          className="relative flex-1 overflow-hidden"
          style={{
            height: 8,
            borderRadius: 4,
            backgroundColor: '#0f0f0f',
            background: `linear-gradient(to right, #4ade80 ${radiantPct}%, #ef4444 ${radiantPct}%)`,
            transition: prefersReducedMotion ? 'none' : 'background 500ms ease',
          }}
        />

        {/* Right: Dire percentage */}
        <span
          className="text-xs font-bold tabular-nums shrink-0"
          style={{ color: '#ef4444', minWidth: 32, textAlign: 'left' }}
        >
          {direPct}%
        </span>
      </div>

      {/* Team labels row — RADIANT left, DIRE right, aligned under bar edges */}
      <div className="flex justify-between mt-2 px-[40px]">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.2em]"
          style={{ color: '#4ade80' }}
        >
          Radiant
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.2em]"
          style={{ color: '#ef4444' }}
        >
          Dire
        </span>
      </div>
    </div>
  )
}
