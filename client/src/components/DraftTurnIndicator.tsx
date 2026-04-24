interface DraftTurnIndicatorProps {
  activeTeam: 'radiant' | 'dire' | null
  action: 'pick' | 'ban' | null
  tentative: boolean
  gameState: number | undefined
  currentStep?: number  // Gap-05: total completed draft actions (0–24 in CM 7.40)
}

/**
 * Maps completed step count to CM 7.40 phase name.
 * NOT exported — internal helper only. The CM 7.40 structure (per draftOrder.ts header):
 *   Ban Phase 1:  steps 0–6   (7 bans)
 *   Pick Phase 1: steps 7–10  (4 picks)
 *   Ban Phase 2:  steps 11–15 (5 bans)
 *   Pick Phase 2: steps 16–19 (4 picks)
 *   Ban Phase 3:  steps 20–21 (2 bans)
 *   Pick Phase 3: steps 22–23 (2 picks)
 *
 * currentStep is the count BEFORE the next action (i.e. what has been done so far).
 * At step 0, Ban Phase 1 is starting. At step 7, Pick Phase 1 is starting. Etc.
 */
function getPhaseName(step: number): string {
  if (step < 7)  return 'Ban Phase 1'
  if (step < 11) return 'Pick Phase 1'
  if (step < 16) return 'Ban Phase 2'
  if (step < 20) return 'Pick Phase 2'
  if (step < 22) return 'Ban Phase 3'
  if (step < 24) return 'Pick Phase 3'
  return 'Draft Complete'
}

/**
 * Text label above the draft grid per D-06 + UI-SPEC §New: <DraftTurnIndicator>.
 * Gap-05: adds a phase sub-label below the main team+action line.
 *
 * Four visual states (04-UI-SPEC §Typography label states table):
 *  1. game_state !== 2 → null (D-07 — hide outside draft).
 *  2. game_state === 2, no inference → "Draft in progress" + phase sub-label.
 *  3. Active confident → "{Team} — {action}" + phase sub-label in team color.
 *  4. Active tentative (D-08) → "{Team} — {action} ?" + phase sub-label, opacity 0.6.
 *
 * Em-dash separator — (U+2014), NOT a hyphen per UI-SPEC §Copywriting.
 */
export default function DraftTurnIndicator({
  activeTeam, action, tentative, gameState, currentStep = 0,
}: DraftTurnIndicatorProps) {
  // D-07: hide entirely outside draft state.
  if (gameState !== 2) return null

  const phaseName = getPhaseName(currentStep)

  // D-08 degradation: no confident team+action → neutral placeholder.
  if (!activeTeam || !action) {
    return (
      <div className="text-center mb-2">
        <p
          className="text-[10px] uppercase tracking-[0.25em] font-bold"
          style={{ color: '#303030' }}
        >
          Draft in progress
        </p>
        <p
          className="text-[10px] uppercase tracking-[0.2em]"
          style={{ color: '#555', marginTop: 2 }}
        >
          {phaseName}
        </p>
      </div>
    )
  }

  const color    = activeTeam === 'radiant' ? '#4ade80' : '#ef4444'
  const teamName = activeTeam === 'radiant' ? 'Radiant' : 'Dire'
  const actionWord = action === 'pick' ? 'picking' : 'banning'
  // Em-dash + trailing " ?" for tentative per UI-SPEC §Copywriting.
  const label = `${teamName} — ${actionWord}${tentative ? ' ?' : ''}`

  return (
    <div
      className="text-center mb-2"
      style={{ opacity: tentative ? 0.6 : 1, transition: 'opacity 160ms ease' }}
    >
      <p
        className="text-[10px] uppercase tracking-[0.25em] font-bold"
        style={{ color }}
      >
        {label}
      </p>
      <p
        className="text-[10px] uppercase tracking-[0.2em]"
        style={{ color: '#555', marginTop: 2 }}
      >
        {phaseName}
      </p>
    </div>
  )
}
