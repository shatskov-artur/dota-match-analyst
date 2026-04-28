import { useEffect, useRef, useState } from 'react'
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
  // Tick once per second so countdowns decrement client-side (overrides Phase 8 Pitfall 4 per user feedback).
  // Reset reference time only when the actual cooldown CONTENT changes (not on every parent re-render),
  // so unrelated parent state updates don't restart the countdown.
  const contentSig = players
    .map(p => `${p.account_id ?? p.hero_id ?? ''}:${p.ultimate_state ?? ''}:${p.ultimate_cooldown ?? ''}`)
    .join('|')
  const sigRef = useRef(contentSig)
  const referenceRef = useRef<number>(Date.now())
  if (sigRef.current !== contentSig) {
    sigRef.current = contentSig
    referenceRef.current = Date.now()
  }
  const [now, setNow] = useState<number>(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsedSeconds = (now - referenceRef.current) / 1000

  // Show every player whose ultimate_state is reported. state===2 decrements client-side;
  // any other state (or remaining===0) is rendered as "ready". On-cooldown rows sort first
  // (ascending), ready rows fall to the bottom.
  const active = players
    .map(p => {
      if (p.ultimate_state == null) return null
      const baseCd = p.ultimate_cooldown ?? 0
      const remaining = p.ultimate_state === 2 ? Math.max(0, baseCd - elapsedSeconds) : 0
      return { ...p, _remaining: remaining }
    })
    .filter((p): p is CooldownPlayer & { _remaining: number } => p != null)
    .sort((a, b) => {
      const aReady = a._remaining <= 0
      const bReady = b._remaining <= 0
      if (aReady && !bReady) return 1
      if (!aReady && bReady) return -1
      return a._remaining - b._remaining
    })

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

              {p._remaining > 0 ? (
                <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#e8e8e8' }}>
                  {Math.round(p._remaining)}
                  <span style={{ fontSize: 12, color: '#555555' }}>s</span>
                </div>
              ) : (
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#4ade80' }}>
                  ready
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
