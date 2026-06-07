import { useRef, useState } from 'react'
import { heroMapper } from '../utils/heroMapper'
// CRITICAL per 04-PATTERNS.md: import from client/src/utils/heroMapper — NOT '@shared/heroMapper'.
// The @shared version uses Node.js createRequire and breaks Vite bundling.
import { winrateColor } from '../utils/winrateColor'
import IntelTooltip from './IntelTooltip'
import type { PlayerIntel } from '../hooks/useMatchIntel'
import type { HeroStatsEntry } from '../hooks/useHeroStats'

interface DraftPortraitProps {
  kind: 'pick' | 'ban'
  heroId?: number
  isActive?: boolean  // Gap-05: true when this slot is the next-to-fill (active team + action)
  ordinal?: string    // Gap-05: "P1"–"P5" for picks, "B1"–"B7" for bans
  // Phase 5 additions:
  heroStats?: HeroStatsEntry  // from useHeroStats() — undefined while loading or on error
  playerIntel?: PlayerIntel   // from useMatchIntel() — undefined while loading or on error
}

/**
 * Single 56×56 draft cell. Three visual states per 04-UI-SPEC:
 *  1. Empty slot — bordered placeholder (same style for picks and bans, D-05).
 *     Gap-05: when isActive=true, adds animate-pulse + ember border to signal the
 *     next pick/ban slot. Uses Tailwind's built-in animate-pulse (opacity 0→1 cycle)
 *     on the border so the slot blinks without adding custom @keyframes to index.css.
 *  2. Filled pick — hero portrait only, full opacity.
 *     Gap-05: shows ordinal badge (P1–P5) in top-left corner when ordinal is provided.
 *     Phase 5: badge strip at bottom edge when heroStats defined (DRAFT-03).
 *     Phase 5: IntelTooltip on hover when playerIntel defined (DRAFT-04, PLAYER-01).
 *  3. Filled ban  — hero portrait + semi-transparent red X overlay (D-04).
 *     Gap-05: shows ordinal badge (B1–B7) in top-left corner when ordinal is provided.
 *
 * Hero identity preserved under the X (D-04) — do NOT dim the portrait when banned.
 * SVG X is aria-hidden (decorative; semantic conveyed by bans row position in DraftColumn).
 *
 * PHASE 5 STRUCTURAL CHANGE (Pitfall 4 fix):
 * The outer wrapper does NOT have overflow-hidden — this allows IntelTooltip (position: absolute)
 * to escape the portrait bounds without clipping. Only the inner portrait div keeps overflow-hidden
 * (required for image cropping, ban X overlay, and badge strip containment).
 */
export default function DraftPortrait({
  kind,
  heroId,
  isActive = false,
  ordinal,
  heroStats,
  playerIntel,
}: DraftPortraitProps) {
  const heroInfo = heroId !== undefined ? heroMapper(heroId) : null
  const anchorRef = useRef<HTMLDivElement>(null)
  const [showTooltip, setShowTooltip] = useState(false)

  // Tooltip is only triggered on filled pick slots with playerIntel data
  const canShowTooltip = kind === 'pick' && heroId !== undefined && !!heroInfo && !!playerIntel

  if (!heroInfo) {
    // Empty placeholder — D-02 + D-05.
    // Gap-05: when isActive, add animate-pulse + ember border to signal next-to-fill slot.
    return (
      <div
        className={`w-14 h-14 shrink-0 rounded-sm${isActive ? ' animate-pulse' : ''}`}
        style={{
          background: 'var(--color-surface)',
          border: isActive ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
        }}
      />
    )
  }

  // Filled slot — outer wrapper: relative WITHOUT overflow-hidden (Pitfall 4 fix).
  // overflow-hidden only on inner portrait div to clip the image + overlays.
  return (
    <div
      ref={anchorRef}
      className="relative w-14 h-14 shrink-0"
      onMouseEnter={() => canShowTooltip && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Inner portrait div — overflow-hidden for image + ban X + badge strip */}
      <div className="absolute inset-0 rounded-sm overflow-hidden">
        <img
          src={heroInfo.portrait}
          alt={heroInfo.name}
          className="w-full h-full object-cover"
        />
        {/* Ban X overlay — aria-hidden (decorative; row position conveys semantic) */}
        {kind === 'ban' && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 24 24"
            aria-hidden="true"
            style={{
              color: 'var(--color-dire)',
              opacity: 0.75,
              filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.7))',
            }}
          >
            <path d="M4 4 L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d="M20 4 L4 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
        )}
        {/* DRAFT-03: Badge strip — pick slots only, when heroId and heroStats defined (D-01, D-02, D-03).
            pick_rate is raw pro_pick count from OpenDota (not a 0–1 percentage).
            Display as "{winRate}%" only — raw pick count shown as "{N}P" suffix.
            Badge sits at bottom edge, inside overflow-hidden (badge stays within portrait bounds). */}
        {kind === 'pick' && heroId !== undefined && heroStats && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'rgba(0,0,0,0.72)',
              padding: '4px 4px',
              textAlign: 'center',
              fontSize: 10,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.2,
            }}
          >
            <span style={{ color: winrateColor(heroStats.win_rate) }}>
              {Math.round(heroStats.win_rate * 100)}%
            </span>
            {/* pick_rate is raw pro_pick count — show with "P" suffix to distinguish from percentage */}
            <span style={{ color: 'var(--color-text-muted)' }}>
              {' '}{'·'}{' '}{heroStats.pick_rate}P
            </span>
          </div>
        )}
      </div>

      {/* Gap-05: ordinal badge — outside overflow-hidden, renders on top of portrait */}
      {ordinal && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            fontSize: 9,
            lineHeight: 1,
            fontWeight: 700,
            color: 'var(--color-text-muted)',
            letterSpacing: '0.05em',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {ordinal}
        </span>
      )}

      {/* DRAFT-04: IntelTooltip — sibling to portrait div (outside overflow-hidden — Pitfall 4 fix).
          Only rendered on pick slots with playerIntel data when user hovers. */}
      {showTooltip && canShowTooltip && (
        <IntelTooltip
          playerIntel={playerIntel}
          heroName={heroInfo.name}
          anchorRef={anchorRef}
          isLoading={false}
        />
      )}
    </div>
  )
}
