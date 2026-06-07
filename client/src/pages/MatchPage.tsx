import { useParams } from 'react-router'
import { Link } from 'react-router'
import { useMatchDetail } from '../hooks/useMatchDetail'
import ScoreHeader from '../components/ScoreHeader'
import HeroPlayerGrid from '../components/HeroPlayerGrid'
import BuildingsSection from '../components/BuildingsSection'
import DotaMapView from '../components/DotaMapView'
import DraftSection from '../components/DraftSection'
import { useDraftDetail } from '../hooks/useDraftDetail'
import { useHeroStats } from '../hooks/useHeroStats'
import { useMatchIntel } from '../hooks/useMatchIntel'
import WinProbBar from '../components/WinProbBar'
import { useWinProbability } from '../hooks/useWinProbability'
import ItemsBlock from '../components/ItemsBlock'
import CooldownsBlock from '../components/CooldownsBlock'
import RoshanBlock from '../components/RoshanBlock'
import HistoryGraphs from '../components/HistoryGraphs'

export default function MatchPage() {
  const { matchId } = useParams()
  const { match, radiantPlayers, direPlayers, buildings, history, isLoading } = useMatchDetail(matchId)
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
    <div className="min-h-screen relative bg-bg text-text font-sans px-4 md:px-6 lg:px-8 py-8">
      <div className="max-w-[1320px] mx-auto">
      {/* Ambient top glow — retinted from red to neutral gold per UI-SPEC */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: 0, left: 0, right: 0, height: 300,
          background: 'radial-gradient(ellipse 60% 40% at 50% 0%, var(--color-primary-soft) 0%, transparent 100%)',
        }}
      />

      {/* Back nav */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 mb-10 text-[11px] uppercase tracking-[0.25em] text-text-dim transition-colors duration-150 hover:text-primary"
      >
        ← Back to matches
      </Link>

      {/* Match title h1 — Display clamp per UI-SPEC */}
      <h1
        className="font-bold leading-none tracking-tight mb-8 text-text"
        style={{
          fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
          letterSpacing: '-0.02em',
        }}
      >
        {match?.radiant_team?.team_name ?? 'TBD'}
        <span style={{ color: 'var(--color-text-dim)' }}> vs </span>
        {match?.dire_team?.team_name ?? 'TBD'}
      </h1>

      {/* ScoreHeader — D-01 section order step 2 */}
      {match && (
        <ScoreHeader match={match} />
      )}

      {/* Phase 6 gap closure: three-bar win probability panel — Gold and Est. always visible past 5 min */}
      <WinProbBar
        stratz={winProb.data?.stratz ?? null}
        gold={winProb.data?.gold ?? 0.5}
        estimate={winProb.data?.estimate ?? 0.5}
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

      {/* Pre-game / loading skeleton — show HeroPlayerGrid alone when in-game gate is closed */}
      {!(match?.game_state === 5 && radiantPlayers.length > 0) && (
        <div className="mt-12">
          <HeroPlayerGrid
            radiantPlayers={radiantPlayers}
            direPlayers={direPlayers}
            isLoading={isLoading}
            playerIntelMap={playerIntelMap}
          />
        </div>
      )}

      {/* In-game three-row layout (sketch 002-C).
          Row 1 (3×flex-1, items-stretch): HeroPlayerGrid | ItemsBlock | CooldownsBlock — equal width and height.
          Row 2 (2×flex-1, items-stretch): DotaMapView | RoshanBlock — 50/50 split.
          Row 3 (2×flex-1, items-stretch): BuildingsSection | HistoryGraphs — 50/50 split.
            When buildings.unavailable, a transparent placeholder div holds the left slot so HistoryGraphs
            still occupies the right half (preserves 50% chart width across pre/post tower-state availability).
          DotaMapView responsive SVG (10.2-03) carries over unchanged.
          CooldownsBlock root (`flex flex-col flex-1 min-h-0 overflow-y-auto`, 10.2-03) carries over unchanged.
          RoshanBlock root (`flex flex-col flex-1`) carries over unchanged. */}
      {match?.game_state === 5 && radiantPlayers.length > 0 && (
        <div className="mt-12 flex flex-col gap-12">
          {/* Row 1 — heroes / items / cooldowns. Mobile-first: stacked below 1180px, 3-col at/above. */}
          <div className="flex flex-col gap-6 stack:flex-row stack:gap-8 stack:items-stretch">
            <div className="min-w-0 stack:flex-1">
              <HeroPlayerGrid
                radiantPlayers={radiantPlayers}
                direPlayers={direPlayers}
                isLoading={isLoading}
                playerIntelMap={playerIntelMap}
              />
            </div>
            <div className="min-w-0 stack:flex-1 flex flex-col">
              <ItemsBlock
                players={[
                  ...radiantPlayers.map(p => ({ ...p, team: 'radiant' as const })),
                  ...direPlayers.map(p => ({ ...p, team: 'dire' as const })),
                ].sort((a, b) => ((b.net_worth as number | undefined) ?? 0) - ((a.net_worth as number | undefined) ?? 0))}
              />
            </div>
            <div className="min-w-0 stack:flex-1 flex flex-col">
              <CooldownsBlock
                players={[
                  ...radiantPlayers.map(p => ({ ...p, team: 'radiant' as const })),
                  ...direPlayers.map(p => ({ ...p, team: 'dire' as const })),
                ]}
              />
            </div>
          </div>

          {/* Row 2 — HistoryGraphs | Roshan+Buildings (320px) | Map (fluid, 420px cap).
              Mobile-first: stacked below 1180px, 3-col at/above; map fluid + centered when stacked. */}
          <div className="flex flex-col gap-8 stack:flex-row stack:items-start">
            <div className="min-w-0 stack:flex-1 flex flex-col">
              <HistoryGraphs
                history={history}
                gameDuration={match?.duration}
                gameState={match?.game_state}
              />
            </div>
            <div className="w-full stack:w-[320px] stack:shrink-0 flex flex-col gap-8">
              <RoshanBlock roshan={match?.roshan ?? null} />
              {!buildings.unavailable && (
                <BuildingsSection buildings={buildings} />
              )}
            </div>
            <div className="w-full stack:w-auto stack:shrink-0 flex justify-center">
              <DotaMapView
                size={420}
                buildings={buildings}
                heroPositions={[
                  ...radiantPlayers
                    .filter(p => typeof p.position_x === 'number' && typeof p.position_y === 'number' && typeof p.hero_id === 'number')
                    .map(p => ({
                      hero_id: p.hero_id as number,
                      team: 'radiant' as const,
                      position_x: p.position_x as number,
                      position_y: p.position_y as number,
                    })),
                  ...direPlayers
                    .filter(p => typeof p.position_x === 'number' && typeof p.position_y === 'number' && typeof p.hero_id === 'number')
                    .map(p => ({
                      hero_id: p.hero_id as number,
                      team: 'dire' as const,
                      position_x: p.position_x as number,
                      position_y: p.position_y as number,
                    })),
                ]}
              />
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
