import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { itemMapper } from '../utils/itemMapper'
import { lookupRoshanLoot } from '../../../shared/roshanLoot'

interface RoshanBlockProps {
  roshan: {
    killCount: number
    alive: boolean
    respawnIn: number | null
    lastKillLoot: number[] | null
  } | null
}

function LootIcon({ itemId, size = 28, dimmed = false }: { itemId: number; size?: number; dimmed?: boolean }) {
  const slug = itemMapper(itemId)
  const [imgError, setImgError] = useState(false)
  const baseStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: 4,
    flexShrink: 0,
    opacity: dimmed ? 0.5 : 1,
  }
  if (!slug || imgError) {
    return <div style={{ ...baseStyle, background: '#1a1a1a', border: '1px solid #2a2a2a' }} aria-label="Empty loot slot" />
  }
  return (
    <img
      src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${slug}.png`}
      alt={slug}
      width={size}
      height={size}
      style={{ ...baseStyle, display: 'block', objectFit: 'cover' }}
      onError={() => setImgError(true)}
    />
  )
}

function formatMmSs(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function RoshanBlock({ roshan }: RoshanBlockProps) {
  const sigRef = useRef<string>('')
  const referenceRef = useRef<number>(Date.now())
  const [now, setNow] = useState<number>(Date.now())

  const contentSig = `${roshan?.respawnIn ?? ''}:${roshan?.killCount ?? ''}`
  if (sigRef.current !== contentSig) {
    sigRef.current = contentSig
    referenceRef.current = Date.now()
  }

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (roshan === null) return null

  const elapsedSeconds = (now - referenceRef.current) / 1000
  const remaining = roshan.respawnIn != null ? Math.max(0, roshan.respawnIn - elapsedSeconds) : 0

  const nextKillNumber = roshan.killCount + 1
  const nextKillLoot = Array.from(lookupRoshanLoot(nextKillNumber))

  return (
    <div className="flex flex-col flex-1">
      {roshan.alive ? (
        <>
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-3" style={{ color: '#555555' }}>
            Roshan #{nextKillNumber}
          </p>
          <div className="flex items-center gap-2 mb-4">
            {nextKillLoot.map((id, i) => <LootIcon key={`next-${i}`} itemId={id} size={32} />)}
          </div>
        </>
      ) : (
        <>
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-2 text-center" style={{ color: '#555555' }}>
            Respawn
          </p>
          <div
            className="text-center mb-3"
            style={{
              fontSize: 28,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              color: '#e8e8e8',
              letterSpacing: '0.05em',
            }}
          >
            {formatMmSs(remaining)}
          </div>
          <div className="flex items-center justify-center gap-2 mb-4">
            {nextKillLoot.map((id, i) => <LootIcon key={`next-dim-${i}`} itemId={id} size={28} dimmed />)}
          </div>
        </>
      )}

      {roshan.killCount >= 1 && roshan.lastKillLoot && (
        <div className="flex flex-col gap-1 mt-2 pt-3 border-t" style={{ borderColor: '#1e1e1e' }}>
          <p className="text-[9px] uppercase tracking-[0.25em]" style={{ color: '#555555' }}>
            Last Drop
          </p>
          <div className="flex items-center gap-1">
            {roshan.lastKillLoot.map((id, i) => <LootIcon key={`last-${i}`} itemId={id} size={20} />)}
          </div>
        </div>
      )}
    </div>
  )
}
