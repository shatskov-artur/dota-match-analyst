import DraftColumn from './DraftColumn'
import DraftTurnIndicator from './DraftTurnIndicator'
import type { Scoreboard } from '../hooks/useDraftDetail'

interface DraftSectionProps {
  scoreboard: Scoreboard             // caller already verified presence (D-10)
  gameState: number | undefined
  activeTeam: 'radiant' | 'dire' | null
  action: 'pick' | 'ban' | null
  tentative: boolean
}

/**
 * Top-level draft widget mounted between ScoreHeader and HeroPlayerGrid per D-03.
 *
 * Visibility contract (CONTEXT §decisions):
 *   D-10: caller (MatchPage) must NOT mount this component when scoreboard is absent.
 *   D-11: final draft stays visible post-game if scoreboard is still in the payload.
 *
 * Glow is prop-driven per D-06: active column is whichever matches `activeTeam` AND
 * game_state === 2. Outside draft state (5, 6, …) both columns render inactive,
 * which intentionally freezes the final draft as read-only context.
 */
export default function DraftSection({
  scoreboard, gameState, activeTeam, action, tentative,
}: DraftSectionProps) {
  const radiantPicks = scoreboard.radiant?.picks ?? []
  const radiantBans  = scoreboard.radiant?.bans  ?? []
  const direPicks    = scoreboard.dire?.picks    ?? []
  const direBans     = scoreboard.dire?.bans     ?? []

  return (
    <section className="mt-12">
      {/* Turn label above the grid — centered; D-07 handles hide on gameState !== 2 */}
      <DraftTurnIndicator
        activeTeam={activeTeam}
        action={action}
        tentative={tentative}
        gameState={gameState}
      />

      {/* Two-column grid: Radiant left, Dire right per D-01 */}
      <div className="flex items-start gap-6">
        <DraftColumn
          team="radiant"
          picks={radiantPicks}
          bans={radiantBans}
          isActive={activeTeam === 'radiant' && gameState === 2}
          tentative={tentative && activeTeam === 'radiant'}
        />
        <DraftColumn
          team="dire"
          picks={direPicks}
          bans={direBans}
          isActive={activeTeam === 'dire' && gameState === 2}
          tentative={tentative && activeTeam === 'dire'}
        />
      </div>
    </section>
  )
}
