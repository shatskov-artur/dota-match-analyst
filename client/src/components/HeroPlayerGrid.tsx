import PlayerRow from './PlayerRow'
import SkeletonPlayerRow from './SkeletonPlayerRow'
import { COL, NAME_MIN_PX, SHOW_GPM, SHOW_XPM, SHOW_LHDN, STAT_CELL } from './playerColumns'
import type { PlayerIntel } from '../hooks/useMatchIntel'

interface HeroPlayerGridProps {
  radiantPlayers: Array<{
    account_id?: number; hero_id?: number; name?: string; team?: number
    kills?: number; death?: number; assists?: number; net_worth?: number
    respawn_timer?: number; level?: number; gpm?: number; xpm?: number; lh?: number; dn?: number
  }>
  direPlayers: Array<{
    account_id?: number; hero_id?: number; name?: string; team?: number
    kills?: number; death?: number; assists?: number; net_worth?: number
    respawn_timer?: number; level?: number; gpm?: number; xpm?: number; lh?: number; dn?: number
  }>
  isLoading: boolean
  /** The map is over — rows must not show a respawn countdown. */
  matchOver?: boolean
  playerIntelMap?: Record<number, PlayerIntel>  // heroId → intel; tooltip on portrait hover (all stages)
}

function ColHeaders({ hasGpm, hasXpm, hasLhDn }: { hasGpm: boolean; hasXpm: boolean; hasLhDn: boolean }) {
  // Geometry mirrors PlayerRow exactly — same widths, same gap, same space gating.
  return (
    <div className="flex items-center gap-2 px-0 mb-1">
      <div className="shrink-0" style={{ width: COL.portrait }} />
      <div className="flex-1 min-w-0" style={{ minWidth: NAME_MIN_PX }} />
      <span className={`text-[10px] uppercase tracking-[0.1em] text-text-dim ${STAT_CELL}`}
            style={{ width: COL.lvl }}>LVL</span>
      <span className={`text-[10px] uppercase tracking-[0.1em] text-text-dim ${STAT_CELL}`}
            style={{ width: COL.kda }}>K/D/A</span>
      <span className={`text-[10px] uppercase tracking-[0.1em] text-text-dim ${STAT_CELL}`}
            style={{ width: COL.nw }}>NW</span>
      {hasGpm && (
        <span className={`text-[10px] uppercase tracking-[0.1em] text-text-dim ${STAT_CELL} ${SHOW_GPM}`}
              style={{ width: COL.gpm }}>GPM</span>
      )}
      {hasXpm && (
        <span className={`text-[10px] uppercase tracking-[0.1em] text-text-dim ${STAT_CELL} ${SHOW_XPM}`}
              style={{ width: COL.xpm }}>XPM</span>
      )}
      {hasLhDn && (
        <span className={`text-[9px] uppercase tracking-[0.05em] text-text-dim ${STAT_CELL} ${SHOW_LHDN}`}
              style={{ width: COL.lhdn }}>LH/DN</span>
      )}
    </div>
  )
}

export default function HeroPlayerGrid({ radiantPlayers, direPlayers, isLoading, matchOver = false, playerIntelMap }: HeroPlayerGridProps) {
  const allPlayers = [...radiantPlayers, ...direPlayers]
  const hasGpm = allPlayers.some((p) => p.gpm !== undefined)
  const hasXpm = allPlayers.some((p) => p.xpm !== undefined)
  const hasLhDn = allPlayers.some((p) => p.lh !== undefined)

  if (isLoading) {
    return (
      <div>
        {Array.from({ length: 10 }).map((_, i) => (
          <SkeletonPlayerRow key={i} />
        ))}
      </div>
    )
  }

  // `@container` makes this panel the query root, so the stat columns gate on the CARD's width
  // rather than the window's — it is one of three flex siblings and can be far narrower than the
  // viewport suggests. Removing this class silently hides every optional column.
  return (
    <div className="@container">
      {/* Radiant group */}
      <p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-2 text-radiant">Radiant</p>
      <ColHeaders hasGpm={hasGpm} hasXpm={hasXpm} hasLhDn={hasLhDn} />
      {radiantPlayers.map((p) => (
        <PlayerRow key={p.account_id ?? p.hero_id ?? p.name} player={p} hasGpm={hasGpm} hasXpm={hasXpm} hasLhDn={hasLhDn} playerIntel={p.hero_id !== undefined ? playerIntelMap?.[p.hero_id] : undefined}
              matchOver={matchOver} />
      ))}

      {/* Dire group */}
      <p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-2 mt-8 text-dire">Dire</p>
      <ColHeaders hasGpm={hasGpm} hasXpm={hasXpm} hasLhDn={hasLhDn} />
      {direPlayers.map((p) => (
        <PlayerRow key={p.account_id ?? p.hero_id ?? p.name} player={p} hasGpm={hasGpm} hasXpm={hasXpm} hasLhDn={hasLhDn} playerIntel={p.hero_id !== undefined ? playerIntelMap?.[p.hero_id] : undefined}
              matchOver={matchOver} />
      ))}
    </div>
  )
}
