interface DraftTurnIndicatorProps {
  activeTeam: 'radiant' | 'dire' | null
  action: 'pick' | 'ban' | null
  tentative: boolean
  gameState: number | undefined
}

/**
 * Text label above the draft grid per D-06 + UI-SPEC §New: <DraftTurnIndicator>.
 *
 * Four visual states (04-UI-SPEC §Typography label states table):
 *  1. game_state !== 2 → null (D-07 — hide outside draft).
 *  2. game_state === 2, no inference → "Draft in progress" in #303030 (ink-3).
 *  3. Active confident → "{Team} — {action}" in team color, opacity 1.
 *  4. Active tentative (D-08) → "{Team} — {action} ?" in team color, opacity 0.6.
 *
 * Em-dash separator — (U+2014), NOT a hyphen per UI-SPEC §Copywriting.
 */
export default function DraftTurnIndicator({ activeTeam, action, tentative, gameState }: DraftTurnIndicatorProps) {
  // D-07: hide entirely outside draft state.
  if (gameState !== 2) return null

  // D-08 degradation: no confident team+action → neutral placeholder.
  if (!activeTeam || !action) {
    return (
      <p
        className="text-[10px] uppercase tracking-[0.25em] font-bold mb-2 text-center"
        style={{ color: '#303030' }}
      >
        Draft in progress
      </p>
    )
  }

  const color = activeTeam === 'radiant' ? '#4ade80' : '#ef4444'
  const teamName = activeTeam === 'radiant' ? 'Radiant' : 'Dire'
  const actionWord = action === 'pick' ? 'picking' : 'banning'
  // Em-dash + trailing " ?" for tentative per UI-SPEC §Copywriting.
  const label = `${teamName} — ${actionWord}${tentative ? ' ?' : ''}`

  return (
    <p
      className="text-[10px] uppercase tracking-[0.25em] font-bold mb-2 text-center"
      style={{
        color,
        opacity: tentative ? 0.6 : 1,
        transition: 'opacity 160ms ease',
      }}
    >
      {label}
    </p>
  )
}
