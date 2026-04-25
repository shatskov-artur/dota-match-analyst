import { inferFirstPickFromHistory, buildDraftTimeline } from '../utils/draftOrder'
import DraftColumn from './DraftColumn'
import DraftTimeline from './DraftTimeline'
import DraftTurnIndicator from './DraftTurnIndicator'
import type { Scoreboard } from '../hooks/useDraftDetail'
import type { HeroStatsEntry } from '../hooks/useHeroStats'
import type { PlayerIntel } from '../hooks/useMatchIntel'

interface DraftSectionProps {
  scoreboard: Scoreboard             // caller already verified presence (D-10)
  gameState: number | undefined
  activeTeam: 'radiant' | 'dire' | null
  action: 'pick' | 'ban' | null
  tentative: boolean
  heroStatsMap?: Record<number, HeroStatsEntry>   // DRAFT-03 — pass to both render paths
  playerIntelMap?: Record<number, PlayerIntel>    // DRAFT-04 — pass to both render paths
}

/**
 * Top-level draft widget between ScoreHeader and HeroPlayerGrid (D-03).
 *
 * Two rendering paths:
 *  - Timeline path (primary): when firstPickTeam is known (non-null), renders all
 *    24 CM 7.40 steps as a single horizontal row in global draft order (gap-06).
 *  - Column path (fallback): when firstPickTeam is ambiguous (draft not yet started
 *    or symmetric step), renders two DraftColumns stacked vertically (gap-05 fallback).
 *
 * Phase 5 (Pitfall 6): heroStatsMap and playerIntelMap forwarded to BOTH rendering paths —
 * DraftTimeline (primary) AND both DraftColumn instances (fallback). Badge strips and tooltips
 * must appear regardless of which path is active.
 *
 * Draft timer and bonus clock are NOT available from Valve WebAPI — planned for Phase 6.
 */
export default function DraftSection({
  scoreboard, gameState, activeTeam, action, tentative,
  heroStatsMap, playerIntelMap,
}: DraftSectionProps) {
  const radiantPicks = scoreboard.radiant?.picks ?? []
  const radiantBans  = scoreboard.radiant?.bans  ?? []
  const direPicks    = scoreboard.dire?.picks    ?? []
  const direBans     = scoreboard.dire?.bans     ?? []

  const currentStep =
    radiantPicks.length + direPicks.length + radiantBans.length + direBans.length

  const firstPickTeam = inferFirstPickFromHistory(scoreboard)
  const timeline = buildDraftTimeline(scoreboard, firstPickTeam)
  const isDraft = gameState === 2

  return (
    <section className="mt-12">
      <DraftTurnIndicator
        activeTeam={activeTeam}
        action={action}
        tentative={tentative}
        gameState={gameState}
        currentStep={currentStep}
      />

      {timeline ? (
        /* Primary: global CM 7.40 order timeline (gap-06) */
        <DraftTimeline
          slots={timeline}
          gameState={gameState}
          heroStatsMap={heroStatsMap}
          playerIntelMap={playerIntelMap}
        />
      ) : (
        /* Fallback: per-team stacked columns when firstPickTeam is ambiguous */
        /* CRITICAL (Pitfall 6): heroStatsMap and playerIntelMap forwarded to BOTH DraftColumn instances */
        <div className="flex flex-col gap-3">
          <DraftColumn
            team="radiant"
            picks={radiantPicks}
            bans={radiantBans}
            isActive={activeTeam === 'radiant' && isDraft}
            tentative={tentative && activeTeam === 'radiant'}
            activePickIndex={isDraft && activeTeam === 'radiant' && action === 'pick' ? radiantPicks.length : -1}
            activeBanIndex={isDraft && activeTeam === 'radiant' && action === 'ban' ? radiantBans.length : -1}
            heroStatsMap={heroStatsMap}
            playerIntelMap={playerIntelMap}
          />
          <DraftColumn
            team="dire"
            picks={direPicks}
            bans={direBans}
            isActive={activeTeam === 'dire' && isDraft}
            tentative={tentative && activeTeam === 'dire'}
            activePickIndex={isDraft && activeTeam === 'dire' && action === 'pick' ? direPicks.length : -1}
            activeBanIndex={isDraft && activeTeam === 'dire' && action === 'ban' ? direBans.length : -1}
            heroStatsMap={heroStatsMap}
            playerIntelMap={playerIntelMap}
          />
        </div>
      )}
    </section>
  )
}
