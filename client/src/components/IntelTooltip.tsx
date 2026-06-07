import { useLayoutEffect, useRef, useState } from 'react'
import { heroMapper } from '../utils/heroMapper'
// CRITICAL: import from '../utils/heroMapper' — NOT '@shared/heroMapper' (Vite bundler compat)
import type { PlayerIntel } from '../hooks/useMatchIntel'

interface IntelTooltipProps {
  playerIntel: PlayerIntel
  heroName: string        // localized hero name (from heroMapper on the played hero)
  anchorRef: React.RefObject<HTMLDivElement | null>
  isLoading?: boolean     // true while useMatchIntel data is in flight
}

/**
 * Positioned floating card for pick portrait hover (DRAFT-04, PLAYER-01, PLAYER-02).
 *
 * Positioning (D-07):
 *   - Default: above portrait (bottom: calc(100% + 8px))
 *   - Flip: below portrait (top: calc(100% + 8px)) when anchorRef.top < 180px
 *   useLayoutEffect fires before browser paint — prevents single-frame position flash (Pitfall 3).
 *
 * Must be rendered OUTSIDE the overflow-hidden portrait div (Pitfall 4).
 * Parent wrapper must be `position: relative` WITHOUT `overflow-hidden`.
 */
export default function IntelTooltip({
  playerIntel,
  heroName,
  anchorRef,
  isLoading = false,
}: IntelTooltipProps) {
  const [positionAbove, setPositionAbove] = useState(true)

  // CRITICAL: useLayoutEffect fires synchronously after DOM updates, before browser paint.
  // This prevents the single-frame position flash that useEffect would cause (Pitfall 3).
  useLayoutEffect(() => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    // D-07 threshold: if portrait top < 180px from viewport top, flip tooltip below
    setPositionAbove(rect.top >= 180)
  }, [anchorRef])

  const positionStyle: React.CSSProperties = positionAbove
    ? { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }
    : { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }

  // Stat line — handles hidden profile (null) and loading states
  const renderStatLine = () => {
    if (isLoading) {
      return <span style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>Loading...</span>
    }
    if (playerIntel.games === null || playerIntel.winRate === null) {
      // PLAYER-02: hidden profile (account_id === 4294967295) — show em dashes (U+2014)
      return (
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
          {'—'} games {'·'} {'—'}% on {heroName}
        </span>
      )
    }
    return (
      <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
        {playerIntel.games} games {'·'} {Math.round(playerIntel.winRate * 100)}% on {heroName}
      </span>
    )
  }

  const hasCounters = playerIntel.counters.length > 0

  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 50,
        minWidth: 160,
        maxWidth: 220,
        background: 'var(--card-bg-grad)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: 8,
        boxShadow: 'var(--shadow-card)',
        pointerEvents: 'none',  // tooltip is read-only — no click capture
        ...positionStyle,
      }}
    >
      {/* Player name — top row, bold */}
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--color-text)',
          margin: 0,
          marginBottom: 2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {playerIntel.playerName}
      </p>

      {/* Stat line */}
      <p style={{ margin: 0, marginBottom: (isLoading || hasCounters) ? 6 : 0 }}>
        {renderStatLine()}
      </p>

      {/* Loading skeleton — counters section with grey placeholders (no animate-pulse) */}
      {isLoading && (
        <>
          {/* Separator */}
          <div style={{ height: 1, background: 'var(--color-border)', marginBottom: 6 }} />
          {/* Section label */}
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--color-text-dim)',
              margin: 0,
              marginBottom: 4,
              textTransform: 'uppercase',
            }}
          >
            Counters
          </p>
          {/* Loading placeholders — no animate-pulse (05-UI-SPEC §Loading States) */}
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  background: 'var(--color-surface-2)',
                  borderRadius: 2,
                  flexShrink: 0,
                }}
              />
              <div style={{ height: 10, background: 'var(--color-surface-2)', borderRadius: 2, flex: 1 }} />
            </div>
          ))}
        </>
      )}

      {/* Counters section — hidden when no counters or loading */}
      {!isLoading && hasCounters && (
        <>
          {/* Separator */}
          <div style={{ height: 1, background: 'var(--color-border)', marginBottom: 6 }} />
          {/* Section label — "Counters" uppercased via CSS text-transform (not hardcoded) */}
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--color-text-dim)',
              margin: 0,
              marginBottom: 4,
              textTransform: 'uppercase',
            }}
          >
            Counters
          </p>
          {/* Top-3 counter rows (D-05) */}
          {playerIntel.counters.map((counter) => {
            const counterInfo = heroMapper(counter.heroId)
            const hasKnownPlayer = counter.knownPlayers.length > 0
            return (
              <div
                key={counter.heroId}
                style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}
              >
                {/* 32px mini-portrait */}
                {counterInfo ? (
                  <img
                    src={counterInfo.portrait}
                    alt={counterInfo.name}
                    width={32}
                    height={32}
                    style={{
                      width: 32,
                      height: 32,
                      objectFit: 'cover',
                      borderRadius: 2,
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      background: 'var(--color-surface-2)',
                      borderRadius: 2,
                      flexShrink: 0,
                    }}
                  />
                )}
                {/* Hero name */}
                <span style={{ fontSize: 10, color: 'var(--color-text)' }}>
                  {counterInfo?.name ?? `Hero ${counter.heroId}`}
                </span>
                {/* D-06: ⚠ flag (U+26A0) + opposing player name when knownPlayers non-empty */}
                {hasKnownPlayer && (
                  <>
                    {/* Space before ⚠ per copywriting spec */}
                    <span style={{ fontSize: 10, color: 'var(--color-dire)' }}>{'⚠'}</span>
                    {/* Opposing player name — truncated to 12 chars with ellipsis */}
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--color-text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 80,
                      }}
                    >
                      {counter.knownPlayers[0].length > 12
                        ? counter.knownPlayers[0].slice(0, 12) + '…'
                        : counter.knownPlayers[0]}
                    </span>
                  </>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
