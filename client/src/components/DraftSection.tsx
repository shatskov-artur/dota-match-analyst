import DraftColumn from './DraftColumn'
import DraftTurnIndicator from './DraftTurnIndicator'
import type { Scoreboard } from '../hooks/useDraftDetail'

interface DraftSectionProps {
  scoreboard: Scoreboard
  gameState: number | undefined
  activeTeam: 'radiant' | 'dire' | null
  action: 'pick' | 'ban' | null
  tentative: boolean
}

/**
 * Top-level draft widget mounted between ScoreHeader and HeroPlayerGrid per D-03.
 *
 * Gap-05: layout changed from side-by-side (flex row) to vertical stack (flex col).
 * Radiant renders on top, Dire on bottom — matches tournament broadcast convention.
 *
 * activeSlotIndex: the index of the NEXT-TO-FILL slot for the active team.
 *   When activeTeam === 'radiant' && action === 'pick': radiantActivePickIndex = radiantPicks.length
 *   When activeTeam === 'radiant' && action === 'ban':  radiantActiveBanIndex  = radiantBans.length
 *   Dire analogously. Non-active team or non-draft state: -1 (no slot highlighted).
 *
 * currentStep: total completed draft actions. Passed to DraftTurnIndicator for phase label.
 *   currentStep = radiantPicks.length + direPicks.length + radiantBans.length + direBans.length
 */
export default function DraftSection({
  scoreboard, gameState, activeTeam, action, tentative,
}: DraftSectionProps) {
  const radiantPicks = scoreboard.radiant?.picks ?? []
  const radiantBans  = scoreboard.radiant?.bans  ?? []
  const direPicks    = scoreboard.dire?.picks    ?? []
  const direBans     = scoreboard.dire?.bans     ?? []

  // currentStep: total completed actions across both teams (0–24 range in CM 7.40).
  const currentStep =
    radiantPicks.length + direPicks.length + radiantBans.length + direBans.length

  // Compute next-to-fill slot index for picks and bans per team.
  // -1 means "no active slot" (not this team's turn, or not in draft state).
  const isDraft = gameState === 2

  const radiantActivePickIndex =
    isDraft && activeTeam === 'radiant' && action === 'pick' ? radiantPicks.length : -1
  const radiantActiveBanIndex  =
    isDraft && activeTeam === 'radiant' && action === 'ban'  ? radiantBans.length  : -1
  const direActivePickIndex    =
    isDraft && activeTeam === 'dire'    && action === 'pick' ? direPicks.length    : -1
  const direActiveBanIndex     =
    isDraft && activeTeam === 'dire'    && action === 'ban'  ? direBans.length     : -1

  return (
    <section className="mt-12">
      {/* Turn label above the grid — centered; D-07 handles hide on gameState !== 2 */}
      <DraftTurnIndicator
        activeTeam={activeTeam}
        action={action}
        tentative={tentative}
        gameState={gameState}
        currentStep={currentStep}
      />

      {/* Gap-05: vertical stack — Radiant on top, Dire on bottom */}
      <div className="flex flex-col gap-3">
        <DraftColumn
          team="radiant"
          picks={radiantPicks}
          bans={radiantBans}
          isActive={activeTeam === 'radiant' && isDraft}
          tentative={tentative && activeTeam === 'radiant'}
          activePickIndex={radiantActivePickIndex}
          activeBanIndex={radiantActiveBanIndex}
        />
        <DraftColumn
          team="dire"
          picks={direPicks}
          bans={direBans}
          isActive={activeTeam === 'dire' && isDraft}
          tentative={tentative && activeTeam === 'dire'}
          activePickIndex={direActivePickIndex}
          activeBanIndex={direActiveBanIndex}
        />
      </div>
    </section>
  )
}
