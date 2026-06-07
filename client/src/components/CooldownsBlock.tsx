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

function UltSlot({ heroId, team }: { heroId?: number; team?: 'radiant' | 'dire' }) {
  const url = heroId != null ? heroUltimateIconUrl(heroId) : null
  const [imgError, setImgError] = useState(false)
  const isEmpty = !url || imgError
  const ring = team === 'dire'
    ? 'inset 0 0 0 1.5px var(--color-dire)'
    : 'inset 0 0 0 1.5px var(--color-radiant)'

  if (isEmpty) {
    return (
      <div
        className="bg-surface-2"
        style={{ width: 32, height: 32, borderRadius: 4, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--color-border)', flexShrink: 0 }}
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
      style={{ width: 32, height: 32, borderRadius: 4, display: 'block', objectFit: 'cover', flexShrink: 0, boxShadow: ring }}
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
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-4 text-text-dim">
        Cooldowns
      </p>

      <div className="flex flex-col">
        {active.map((p, index) => {
          const heroInfo = p.hero_id != null ? heroMapper(p.hero_id) : null
          return (
            <div
              key={p.account_id ?? p.hero_id ?? index}
              className="flex items-center border-b border-border transition-colors duration-150 hover:bg-surface-2"
              style={{
                minHeight: 44,
                gap: 8,
              }}
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
                <div className="bg-surface" style={{ width: 32, height: 32, borderRadius: 4, flexShrink: 0 }} />
              )}

              <UltSlot heroId={p.hero_id} team={p.team} />

              {p._remaining > 0 ? (
                <div className="font-mono" style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--color-accent)' }}>
                  {Math.round(p._remaining)}
                  <span className="text-text-dim" style={{ fontSize: 12 }}>s</span>
                </div>
              ) : (
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-radiant)' }}>
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
