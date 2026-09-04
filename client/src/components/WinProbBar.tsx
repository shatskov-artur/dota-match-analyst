export interface WinProbBarProps {
  /** Stratz live model; null = hide Stratz bar (but still show Gold and Est.) */
  stratz: number | null
  /** Gold-only sigmoid — always a finite number when panel is shown */
  gold: number
  /** Multi-feature sigmoid — always a finite number when panel is shown */
  estimate: number
  /** match.duration in seconds (NOT game_time — field doesn't exist) */
  gameDuration: number | undefined
  /** match.game_state from Valve payload */
  gameState: number | undefined
}

interface SingleBarProps {
  label: string           // 'Stratz' | 'Gold' | 'Est.'
  radiantProb: number     // ∈ [0, 1]
  prefersReducedMotion: boolean
}

function SingleBar({ label, radiantProb, prefersReducedMotion }: SingleBarProps) {
  const radiantPct = Math.round(radiantProb * 100)
  const direPct = 100 - radiantPct
  return (
    <div className="flex items-center gap-3 mb-3">
      {/* Source label */}
      <span
        className="text-label font-bold uppercase tracking-label shrink-0 text-text-muted"
        style={{ minWidth: 36, textAlign: 'right' }}
      >
        {label}
      </span>
      {/* Left: Radiant percentage */}
      <span
        className="text-body font-bold tabular-nums shrink-0 font-mono"
        style={{ color: 'var(--color-radiant)', minWidth: 32, textAlign: 'right' }}
      >
        {radiantPct}%
      </span>
      {/* Gradient bar */}
      <div
        role="progressbar"
        aria-valuenow={radiantPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} Radiant win probability`}
        className="relative flex-1 min-w-[120px] overflow-hidden"
        style={{
          height: 8,
          borderRadius: 4,
          backgroundColor: 'var(--color-dire-soft)',
          background: `linear-gradient(to right, var(--color-radiant) ${radiantPct}%, var(--color-dire) ${radiantPct}%)`,
          transition: prefersReducedMotion ? 'none' : 'background 500ms ease',
        }}
      />
      {/* Right: Dire percentage */}
      <span
        className="text-body font-bold tabular-nums shrink-0 font-mono"
        style={{ color: 'var(--color-dire)', minWidth: 32, textAlign: 'left' }}
      >
        {direPct}%
      </span>
    </div>
  )
}

/**
 * Three-bar win probability panel.
 * Self-gates: returns null when not in-game (gameState!==5) or before 5 minutes.
 * Stratz bar is conditional — hidden when stratz is null.
 * Gold and Est. bars always render when panel is visible.
 */
export default function WinProbBar({ stratz, gold, estimate, gameDuration, gameState }: WinProbBarProps) {
  // Show panel only when in-game (gameState===5) and past 5 minutes
  // Gold and Est. always render when panel shows — they never need Stratz
  if (gameState !== 5 || (gameDuration ?? 0) <= 300) {
    return null
  }

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <div className="w-full py-4 border-b border-border">
      {/* Stratz bar — only when Stratz has data for this match */}
      {stratz !== null && (
        <SingleBar label="Stratz" radiantProb={stratz} prefersReducedMotion={prefersReducedMotion} />
      )}
      {/* Gold bar — always shown (gold-only sigmoid from Valve data) */}
      <SingleBar label="Gold" radiantProb={gold} prefersReducedMotion={prefersReducedMotion} />
      {/* Est. bar — always shown (multi-feature sigmoid from Valve data) */}
      <SingleBar label="Est." radiantProb={estimate} prefersReducedMotion={prefersReducedMotion} />
    </div>
  )
}
