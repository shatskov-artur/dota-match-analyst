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
    return (
      <div
        className="bg-surface-2"
        style={{ ...baseStyle, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--color-border)' }}
        aria-label="Empty loot slot"
      />
    )
  }
  return (
    <img
      src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${slug}.png`}
      alt={slug}
      width={size}
      height={size}
      style={{ ...baseStyle, display: 'block', objectFit: 'cover', boxShadow: 'inset 0 0 0 1px var(--color-primary-soft)' }}
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

// Re-anchor to the server's view only when local prediction drifts more than this
// many seconds from the freshly-reported respawnIn. Below the threshold we ride
// the local 1Hz tick to avoid the visible "jump" at every 30s backend resync.
const RESYNC_DRIFT_THRESHOLD_SECONDS = 5

export default function RoshanBlock({ roshan }: RoshanBlockProps) {
  const killCountRef = useRef<number>(-1)
  const anchorRespawnRef = useRef<number>(0) // server-reported respawnIn at last anchor
  const anchorAtRef = useRef<number>(Date.now()) // wall clock when we anchored
  const [now, setNow] = useState<number>(Date.now())

  // Anchor decisions: re-anchor only on killCount transition or large drift.
  // Backend tick (30s) is constant, so a fresh respawnIn arrives roughly every poll;
  // ignoring it lets the local 1Hz countdown stay smooth.
  if (roshan && roshan.respawnIn != null) {
    const anchorIsFresh = killCountRef.current === roshan.killCount
    const elapsedSinceAnchor = (Date.now() - anchorAtRef.current) / 1000
    const localPrediction = anchorRespawnRef.current - elapsedSinceAnchor
    const drift = Math.abs(localPrediction - roshan.respawnIn)
    if (!anchorIsFresh || drift > RESYNC_DRIFT_THRESHOLD_SECONDS) {
      killCountRef.current = roshan.killCount
      anchorRespawnRef.current = roshan.respawnIn
      anchorAtRef.current = Date.now()
    }
  } else if (roshan && killCountRef.current !== roshan.killCount) {
    killCountRef.current = roshan.killCount
  }

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (roshan === null) return null

  const elapsedSeconds = (now - anchorAtRef.current) / 1000
  const remaining = roshan.respawnIn != null
    ? Math.max(0, anchorRespawnRef.current - elapsedSeconds)
    : 0

  const nextKillNumber = roshan.killCount + 1
  const nextKillLoot = Array.from(lookupRoshanLoot(nextKillNumber))

  return (
    <div className="flex flex-col flex-1">
      <div className="max-w-[360px] mx-auto w-full">
        {roshan.alive ? (
          <>
            <p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-3" style={{ color: 'var(--color-text-dim)' }}>
              Roshan #{nextKillNumber}
            </p>
            <div className="flex items-center gap-2 mb-4">
              {nextKillLoot.map((id, i) => <LootIcon key={`next-${i}`} itemId={id} size={32} />)}
            </div>
          </>
        ) : (
          <>
            <p className="text-[10px] uppercase tracking-[0.3em] font-bold mb-2 text-center" style={{ color: 'var(--color-text-dim)' }}>
              Respawn
            </p>
            <div
              className="text-center mb-3 font-mono"
              style={{
                fontSize: 28,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--color-text)',
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
          <div className="flex flex-col gap-1 mt-2 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <p className="text-[9px] uppercase tracking-[0.25em]" style={{ color: 'var(--color-text-dim)' }}>
              Last Drop
            </p>
            <div className="flex items-center gap-1">
              {roshan.lastKillLoot.map((id, i) => <LootIcon key={`last-${i}`} itemId={id} size={20} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
