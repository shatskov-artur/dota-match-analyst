import { heroMapper } from '../utils/heroMapper'
// CRITICAL per 04-PATTERNS.md: import from client/src/utils/heroMapper — NOT '@shared/heroMapper'.
// The @shared version uses Node.js createRequire and breaks Vite bundling.

interface DraftPortraitProps {
  kind: 'pick' | 'ban'
  heroId?: number
  isActive?: boolean  // Gap-05: true when this slot is the next-to-fill (active team + action)
  ordinal?: string    // Gap-05: "P1"–"P5" for picks, "B1"–"B7" for bans
}

/**
 * Single 56×56 draft cell. Three visual states per 04-UI-SPEC:
 *  1. Empty slot — bordered placeholder (same style for picks and bans, D-05).
 *     Gap-05: when isActive=true, adds animate-pulse + ember border to signal the
 *     next pick/ban slot. Uses Tailwind's built-in animate-pulse (opacity 0→1 cycle)
 *     on the border so the slot blinks without adding custom @keyframes to index.css.
 *  2. Filled pick — hero portrait only, full opacity.
 *     Gap-05: shows ordinal badge (P1–P5) in top-left corner when ordinal is provided.
 *  3. Filled ban  — hero portrait + semi-transparent red X overlay (D-04).
 *     Gap-05: shows ordinal badge (B1–B7) in top-left corner when ordinal is provided.
 *
 * Hero identity preserved under the X (D-04) — do NOT dim the portrait when banned.
 * SVG X is aria-hidden (decorative; semantic conveyed by bans row position in DraftColumn).
 */
export default function DraftPortrait({ kind, heroId, isActive = false, ordinal }: DraftPortraitProps) {
  const heroInfo = heroId !== undefined ? heroMapper(heroId) : null

  if (!heroInfo) {
    // Empty placeholder — D-02 + D-05.
    // Gap-05: when isActive, add animate-pulse + ember border to signal next-to-fill slot.
    return (
      <div
        className={`w-14 h-14 shrink-0 rounded-sm${isActive ? ' animate-pulse' : ''}`}
        style={{
          background: '#141414',
          border: isActive ? '1px solid #b03030' : '1px solid #1e1e1e',
        }}
      />
    )
  }

  // Filled slot — show portrait, ban X overlay (if ban), and ordinal badge (if provided).
  return (
    <div className="relative w-14 h-14 shrink-0 rounded-sm overflow-hidden">
      <img
        src={heroInfo.portrait}
        alt={heroInfo.name}
        className="w-14 h-14 object-cover rounded-sm"
      />
      {kind === 'ban' && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 24 24"
          aria-hidden="true"
          style={{
            color: '#ef4444',
            opacity: 0.75,
            filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.7))',
          }}
        >
          <path d="M4 4 L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M20 4 L4 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      )}
      {/* Gap-05: ordinal badge — shown only on filled slots (heroInfo present). */}
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
            color: '#888',
            letterSpacing: '0.05em',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {ordinal}
        </span>
      )}
    </div>
  )
}
