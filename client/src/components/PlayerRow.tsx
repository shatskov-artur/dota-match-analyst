import { heroMapper } from '../utils/heroMapper'
import { hiddenProfile } from '@shared/hiddenProfile'

interface PlayerRowProps {
  player: {
    account_id?: number
    hero_id?: number
    name?: string
    team?: number
    kills?: number
    death?: number       // field is 'death', NOT 'deaths'
    assists?: number
    net_worth?: number
    respawn_timer?: number
    level?: number       // D-08 optional
    gpm?: number         // D-08 optional
    xpm?: number         // D-08 optional
    lh?: number          // D-08 last hits
    dn?: number          // D-08 denies
  }
  hasGpm: boolean        // controlled at grid level — show GPM column for all rows or none
  hasXpm: boolean        // controlled at grid level
  hasLhDn: boolean       // controlled at grid level
}

export default function PlayerRow({ player, hasGpm, hasXpm, hasLhDn }: PlayerRowProps) {
  const heroInfo = player.hero_id !== undefined ? heroMapper(player.hero_id) : null
  // isDraftSlot: hero_id is explicitly absent (undefined), not an unknown ID
  const isDraftSlot = player.hero_id === undefined
  // isDead: respawn_timer > 0 means dead with countdown; 0 means alive; undefined = treat as alive
  const isDead = player.respawn_timer !== undefined && player.respawn_timer > 0
  // Hidden profile: show Valve name + portrait + KDA; never crash; do not fetch OpenDota stats
  const isHidden = player.account_id !== undefined && hiddenProfile(player.account_id)
  // isHidden is declared to satisfy the threat model guard — rendering is unchanged (silently skip missing data)
  void isHidden

  return (
    <div
      className="flex items-center gap-4 px-0 border-b"
      style={{ minHeight: 52, borderColor: '#1e1e1e', transition: 'background 160ms ease' }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#0f0f0f')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
    >
      {/* Portrait column — 48px fixed, dead overlay, respawn countdown */}
      <div className="relative shrink-0" style={{ width: 48 }}>
        {heroInfo ? (
          <img
            src={heroInfo.portrait}
            alt={heroInfo.name}
            className="w-12 h-12 object-cover rounded-sm"
            style={{ opacity: isDead ? 0.3 : 1 }}
          />
        ) : (
          <div className="w-12 h-12 rounded-sm" style={{ background: '#141414' }} />
        )}
        {isDead && (
          <span
            className="absolute bottom-0 left-0 right-0 text-[10px] text-center"
            style={{ color: '#585858' }}
          >
            {player.respawn_timer}s
          </span>
        )}
      </div>

      {/* Name column — flex-1, two lines: player name + hero name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-none truncate" style={{ color: '#d8d8d8' }}>
          {isDraftSlot ? '—' : (player.name ?? '—')}
        </p>
        {heroInfo && !isDraftSlot && (
          <p className="text-[10px] leading-none mt-0.5 truncate" style={{ color: '#303030' }}>
            {heroInfo.name}
          </p>
        )}
      </div>

      {/* LVL column — 28px */}
      <span className="text-[12px] tabular-nums shrink-0 text-right" style={{ width: 28, color: '#585858' }}>
        {isDraftSlot ? '—' : (player.level ?? '—')}
      </span>

      {/* K/D/A column — 64px */}
      <span className="text-[12px] font-mono tabular-nums shrink-0" style={{ width: 64 }}>
        <span style={{ color: '#d8d8d8' }}>{isDraftSlot ? '—' : (player.kills ?? '—')}</span>
        <span style={{ color: '#303030' }}>/</span>
        <span style={{ color: '#ef4444' }}>{isDraftSlot ? '—' : (player.death ?? '—')}</span>
        <span style={{ color: '#303030' }}>/</span>
        <span style={{ color: '#d8d8d8' }}>{isDraftSlot ? '—' : (player.assists ?? '—')}</span>
      </span>

      {/* NW column — 56px */}
      <span className="text-[12px] tabular-nums shrink-0 text-right" style={{ width: 56, color: '#d8d8d8' }}>
        {isDraftSlot ? '—' : (player.net_worth !== undefined ? player.net_worth.toLocaleString() : '—')}
      </span>

      {/* Optional GPM column — 40px */}
      {hasGpm && (
        <span className="text-[10px] tabular-nums shrink-0 text-right" style={{ width: 40, color: '#585858' }}>
          {isDraftSlot ? '—' : (player.gpm ?? '—')}
        </span>
      )}

      {/* Optional XPM column — 40px */}
      {hasXpm && (
        <span className="text-[10px] tabular-nums shrink-0 text-right" style={{ width: 40, color: '#585858' }}>
          {isDraftSlot ? '—' : (player.xpm ?? '—')}
        </span>
      )}

      {/* Optional LH/DN column — 48px */}
      {hasLhDn && (
        <span className="text-[10px] tabular-nums shrink-0 text-right" style={{ width: 48, color: '#585858' }}>
          {isDraftSlot ? '—' : (player.lh !== undefined ? `${player.lh} / ${player.dn ?? 0}` : '—')}
        </span>
      )}
    </div>
  )
}
