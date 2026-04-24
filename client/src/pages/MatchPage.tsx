import { useParams } from 'react-router'
import { Link } from 'react-router'
import { useMatchDetail } from '../hooks/useMatchDetail'
import ScoreHeader from '../components/ScoreHeader'
import HeroPlayerGrid from '../components/HeroPlayerGrid'
import BuildingsSection from '../components/BuildingsSection'
import DraftSection from '../components/DraftSection'
import { useDraftDetail } from '../hooks/useDraftDetail'

export default function MatchPage() {
  const { matchId } = useParams()
  const { match, radiantPlayers, direPlayers, buildings, isLoading } = useMatchDetail(matchId)
  const draft = useDraftDetail(matchId)

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

      {/* DraftSection — Phase 4 D-03 section order step 3; D-10 mount only when scoreboard present */}
      {draft.scoreboard && (
        <DraftSection
          scoreboard={draft.scoreboard}
          gameState={draft.gameState}
          activeTeam={draft.activeTeam}
          action={draft.action}
          tentative={draft.tentative}
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
