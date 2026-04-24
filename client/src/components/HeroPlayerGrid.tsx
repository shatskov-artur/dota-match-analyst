import PlayerRow from './PlayerRow'
import SkeletonPlayerRow from './SkeletonPlayerRow'

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
}

export default function HeroPlayerGrid({ radiantPlayers, direPlayers, isLoading }: HeroPlayerGridProps) {
  const allPlayers = [...radiantPlayers, ...direPlayers]
  // Type assertion needed because level/gpm/xpm/lh/dn come via .passthrough() not always in static type
  const hasGpm = allPlayers.some((p) => (p as any).gpm !== undefined)
  const hasXpm = allPlayers.some((p) => (p as any).xpm !== undefined)
  const hasLhDn = allPlayers.some((p) => (p as any).lh !== undefined)

  // Column headers: fixed widths must align with PlayerRow column widths
  const ColHeaders = () => (
    <div className="flex items-center gap-4 px-0 mb-1">
      <div className="shrink-0" style={{ width: 48 }} />  {/* portrait spacer */}
      <div className="flex-1" />                            {/* name spacer */}
      <span className="text-[10px] uppercase tracking-[0.2em] shrink-0 text-right"
            style={{ width: 28, color: '#555555' }}>LVL</span>
      <span className="text-[10px] uppercase tracking-[0.2em] shrink-0 text-right"
            style={{ width: 64, color: '#555555' }}>K/D/A</span>
      <span className="text-[10px] uppercase tracking-[0.2em] shrink-0 text-right"
            style={{ width: 56, color: '#555555' }}>NW</span>
      {hasGpm && (
        <span className="text-[10px] uppercase tracking-[0.2em] shrink-0 text-right"
              style={{ width: 40, color: '#555555' }}>GPM</span>
      )}
      {hasXpm && (
        <span className="text-[10px] uppercase tracking-[0.2em] shrink-0 text-right"
              style={{ width: 40, color: '#555555' }}>XPM</span>
      )}
      {hasLhDn && (
        <span className="text-[10px] uppercase tracking-[0.2em] shrink-0 text-right"
              style={{ width: 48, color: '#555555' }}>LH/DN</span>
      )}
    </div>
  )

  if (isLoading) {
    return (
      <div>
        {Array.from({ length: 10 }).map((_, i) => (
          <SkeletonPlayerRow key={i} />
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Radiant group */}
      <p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-2"
         style={{ color: '#4ade80' }}>Radiant</p>
      <ColHeaders />
      {radiantPlayers.map((p, i) => (
        <PlayerRow key={i} player={p} hasGpm={hasGpm} hasXpm={hasXpm} hasLhDn={hasLhDn} />
      ))}

      {/* Dire group */}
      <p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-2 mt-8"
         style={{ color: '#ef4444' }}>Dire</p>
      {direPlayers.map((p, i) => (
        <PlayerRow key={i} player={p} hasGpm={hasGpm} hasXpm={hasXpm} hasLhDn={hasLhDn} />
      ))}
    </div>
  )
}
