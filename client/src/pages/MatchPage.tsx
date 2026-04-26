import { useParams } from 'react-router'
import { Link } from 'react-router'
import { useMatchDetail } from '../hooks/useMatchDetail'
import ScoreHeader from '../components/ScoreHeader'
import HeroPlayerGrid from '../components/HeroPlayerGrid'
import BuildingsSection from '../components/BuildingsSection'
import DraftSection from '../components/DraftSection'
import { useDraftDetail } from '../hooks/useDraftDetail'
import { useHeroStats } from '../hooks/useHeroStats'
import { useMatchIntel } from '../hooks/useMatchIntel'
import WinProbBar from '../components/WinProbBar'
import { useWinProbability } from '../hooks/useWinProbability'

export default function MatchPage() {
  const { matchId } = useParams()
  const { match, radiantPlayers, direPlayers, buildings, isLoading } = useMatchDetail(matchId)
  const draft = useDraftDetail(matchId)
  const heroStatsMap = useHeroStats()
  const intel = useMatchIntel(matchId)
  const winProb = useWinProbability(matchId)

  // Build playerIntelMap: heroId → PlayerIntel for quick lookup by portrait slots (DraftPortrait looks up by heroId)
  // IMPORTANT: indexed by heroId (not accountId) — DraftPortrait receives heroId from the slot
  const playerIntelMap = intel.data
    ? Object.fromEntries(intel.data.players.map(p => [p.heroId, p]))
    : undefined

  return (
    <div
      className="min-h-screen p-8 relative"
      style={{ background: '#0a0a0a', color: '#d8d8d8' }}
    >
      {/* Ambient top glow — copy verbatim from MatchPlaceholder */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: 0, left: 0, right: 0, height: 300,
          background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(176,48,48,0.03) 0%, transparent 100%)',
        }}
      />

      {/* Back nav */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 mb-10 text-[11px] uppercase tracking-[0.25em]"
        style={{ color: '#666666', transition: 'color 160ms ease' }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#e05050')}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#666666')}
      >
        ← Back to matches
      </Link>

      {/* Match title h1 */}
      <h1
        className="font-bold leading-none tracking-tight mb-8"
        style={{
          fontSize: 'clamp(1.8rem, 5vw, 3.5rem)',
          color: '#ffffff',
          letterSpacing: '-0.02em',
        }}
      >
        {match?.radiant_team?.team_name ?? 'TBD'}
        <span style={{ color: '#3a3a3a' }}> vs </span>
        {match?.dire_team?.team_name ?? 'TBD'}
      </h1>

      {/* ScoreHeader — D-01 section order step 2 */}
      {match && (
        <ScoreHeader match={match} />
      )}

      {/* Phase 6 D-04: Win probability bar — self-hides when Stratz unavailable, before 5 min, or non-game state */}
      <WinProbBar
        radiantWinProb={winProb.data?.radiantWinProb ?? null}
        gameDuration={match?.duration}
        gameState={match?.game_state}
      />

      {/* DraftSection — Phase 4 D-03 section order step 3; D-10 mount only when scoreboard present */}
      {/* Phase 5: heroStatsMap and playerIntelMap passed for badge strips (DRAFT-03) and tooltips (DRAFT-04) */}
      {draft.scoreboard && (
        <DraftSection
          scoreboard={draft.scoreboard}
          gameState={draft.gameState}
          activeTeam={draft.activeTeam}
          action={draft.action}
          tentative={draft.tentative}
          heroStatsMap={heroStatsMap}
          playerIntelMap={playerIntelMap}
        />
      )}

      {/* HeroPlayerGrid — D-01 section order step 3; D-05 merged widget */}
      <div className="mt-12">
        <HeroPlayerGrid
          radiantPlayers={radiantPlayers}
          direPlayers={direPlayers}
          isLoading={isLoading}
        />
      </div>

      {/* BuildingsSection — D-01 section order step 4; D-10 hidden when unavailable */}
      {!buildings.unavailable && (
        <div className="mt-12">
          <BuildingsSection buildings={buildings} />
        </div>
      )}
    </div>
  )
}
