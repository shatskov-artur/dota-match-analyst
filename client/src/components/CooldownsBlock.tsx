import { useEffect, useRef, useState } from 'react'
import { heroMapper } from '../utils/heroMapper'
import { heroUltimateIconUrl } from '../utils/heroUltimateMapper'

interface CooldownPlayer {
  hero_id?: number
  account_id?: number
  team: 'radiant' | 'dire'
  ultimate_state?: number
  ultimate_cooldown?: number
  level?: number
  xpm?: number
  [key: string]: unknown
}

interface CooldownsBlockProps {
  players: CooldownPlayer[]
  /** Live game clock, for estimating how far a hero is from its ultimate. */
  gameDuration?: number
}

/**
 * What Valve's two ultimate fields actually mean, read off real snapshots rather than the
 * enum we assumed.
 *
 * The block used to test `ultimate_state === 2` for "on cooldown". That value never
 * occurs. From TI 2026 minute 20/30/35 of match 8946351114:
 *
 *   lvl 21  state 1  cooldown 62   ← ult down, 62 s left
 *   lvl 21  state 3  cooldown  0   ← ult up
 *   lvl  1  state 0  cooldown  0   ← not learned yet
 *
 * The same player reads cooldown 12, then 62, then 42 across those minutes, so the number
 * is the remaining time, not the ability's base cooldown. Because state 2 never matched,
 * every row rendered "READY" — including heroes whose ultimate was down, and including
 * level-1 heroes that have no ultimate at all.
 *
 * The rule below leans on the number rather than on the enum: a positive cooldown IS a
 * cooldown whichever code accompanies it, and only state 0 — the one value confirmed
 * against level-1 players — means "not learned". That survives Valve renumbering the enum,
 * which is how this broke in the first place.
 */
export type UltStatus =
  | { kind: 'cooldown'; remaining: number }
  | { kind: 'ready' }
  | { kind: 'locked' }

export function ultimateStatus(
  player: Pick<CooldownPlayer, 'ultimate_state' | 'ultimate_cooldown'>,
  elapsedSeconds: number,
): UltStatus | null {
  if (player.ultimate_state == null) return null
  if (player.ultimate_state === 0) return { kind: 'locked' }
  const remaining = Math.max(0, (player.ultimate_cooldown ?? 0) - elapsedSeconds)
  return remaining > 0 ? { kind: 'cooldown', remaining } : { kind: 'ready' }
}

/** Cumulative XP for level 6, where a standard ultimate unlocks. */
const XP_FOR_ULTIMATE = 2440

/**
 * Roughly how much XP a hero still needs before its ultimate unlocks.
 *
 * Valve's live scoreboard carries no raw XP — only `level` and `xp_per_min` — but XPM is
 * total XP over minutes played, so multiplying it back out recovers the total closely
 * enough. Checked against a live payload: 283 xpm at 5:00 gives ~1415 XP, which lands in
 * level 4, exactly the level reported beside it.
 *
 * Approximate by construction, hence rounded to a readable number and shown with "≈".
 * Returns null once the hero is level 6 — there is nothing left to wait for — and for a
 * hero whose ultimate is not on the standard schedule the caller never asks, because it
 * only asks about ultimates Valve reports as unlearned.
 */
export function xpToUltimate(
  level: number | undefined,
  xpm: number | undefined,
  durationSeconds: number | undefined,
): number | null {
  if (!level || level >= 6) return null
  if (!xpm || !durationSeconds || durationSeconds <= 0) return null
  const earned = (xpm * durationSeconds) / 60
  const remaining = XP_FOR_ULTIMATE - earned
  return remaining > 0 ? Math.round(remaining) : null
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

export default function CooldownsBlock({ players, gameDuration }: CooldownsBlockProps) {
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

  // Cooldowns first, shortest remaining at the top; then heroes that are up; then the ones
  // that have no ultimate yet, which is the least urgent thing on the panel.
  const RANK = { cooldown: 0, ready: 1, locked: 2 } as const
  const active = players
    .map(p => {
      const status = ultimateStatus(p, elapsedSeconds)
      if (!status) return null
      return { ...p, _status: status }
    })
    .filter((p): p is CooldownPlayer & { _status: UltStatus } => p != null)
    .sort((a, b) => {
      const byKind = RANK[a._status.kind] - RANK[b._status.kind]
      if (byKind !== 0) return byKind
      if (a._status.kind === 'cooldown' && b._status.kind === 'cooldown') {
        return a._status.remaining - b._status.remaining
      }
      return 0
    })

  if (active.length === 0) return null

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto scroll-slim">
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

              {p._status.kind === 'cooldown' && (
                <div className="font-mono" style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--color-accent)' }}>
                  {Math.round(p._status.remaining)}
                  <span className="text-text-dim" style={{ fontSize: 12 }}>s</span>
                </div>
              )}
              {p._status.kind === 'ready' && (
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-radiant)' }}>
                  ready
                </div>
              )}
              {p._status.kind === 'locked' && (
                // No ultimate yet — how far off it is beats a green "ready" that is a lie.
                <div
                  className="font-mono text-text-dim"
                  style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}
                  title="Estimated XP still needed for level 6, when the ultimate unlocks"
                >
                  {(() => {
                    const xp = xpToUltimate(p.level, p.xpm, gameDuration)
                    return xp === null ? 'lvl 6' : `≈${xp.toLocaleString('en-US')} xp`
                  })()}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
