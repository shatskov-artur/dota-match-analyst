import { useState } from 'react'
import { heroMapper } from '../utils/heroMapper'
import { heroUltimateIconUrl } from '../utils/heroUltimateMapper'

interface CooldownPlayer {
  hero_id?: number
  account_id?: number
  team: 'radiant' | 'dire'
  ultimate_state?: number
  ultimate_cooldown?: number
  [key: string]: unknown
}

interface CooldownsBlockProps {
  players: CooldownPlayer[]
}

function UltSlot({ heroId }: { heroId?: number }) {
  const url = heroId != null ? heroUltimateIconUrl(heroId) : null
  const [imgError, setImgError] = useState(false)
  const isEmpty = !url || imgError

  if (isEmpty) {
    return (
      <div
        style={{ width: 32, height: 32, borderRadius: 4, background: '#1a1a1a', border: '1px solid #2a2a2a', flexShrink: 0 }}
        aria-label="Empty ability slot"
      />
    )
  }

  return (
    <img
      src={url}
      alt="ultimate"
      width={32}
      height={32}
      style={{ width: 32, height: 32, borderRadius: 4, display: 'block', objectFit: 'cover', flexShrink: 0 }}
      onError={() => setImgError(true)}
    />
  )
}

export default function CooldownsBlock({ players }: CooldownsBlockProps) {
  const active = players
    .filter(p => p.ultimate_state != null && p.ultimate_state !== 1)
    .sort((a, b) => (a.ultimate_cooldown ?? 0) - (b.ultimate_cooldown ?? 0))

  if (active.length === 0) return null

  return (
    <div className="flex flex-col flex-1">
      <p
        className="text-[10px] uppercase tracking-[0.3em] font-bold mb-4"
        style={{ color: '#555555' }}
      >
        Cooldowns
      </p>

      <div className="flex flex-col">
        {active.map((p, index) => {
          const heroInfo = p.hero_id != null ? heroMapper(p.hero_id) : null
          return (
            <div
              key={p.account_id ?? p.hero_id ?? index}
              className="flex items-center border-b"
              style={{
                minHeight: 44,
                borderColor: '#1e1e1e',
                gap: 8,
                transition: 'background 160ms ease',
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#0f0f0f')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
            >
              {heroInfo ? (
                <img
                  src={heroInfo.portrait}
                  alt={heroInfo.name}
                  width={32}
                  height={32}
                  style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <div style={{ width: 32, height: 32, borderRadius: 4, background: '#141414', flexShrink: 0 }} />
              )}

              <UltSlot heroId={p.hero_id} />

              <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#e8e8e8' }}>
                {p.ultimate_state === 0 ? '—' : Math.max(0, Math.round(p.ultimate_cooldown ?? 0))}
                {p.ultimate_state !== 0 && <span style={{ fontSize: 12, color: '#555555' }}>s</span>}
              </div>

              {p.ultimate_state === 3 && <span style={{ fontSize: 10, color: '#555555' }}>charging</span>}
              {p.ultimate_state === 0 && <span style={{ fontSize: 10, color: '#555555' }}>unavail</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
