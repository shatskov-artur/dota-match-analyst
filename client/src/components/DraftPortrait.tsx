import { heroMapper } from '../utils/heroMapper'
// CRITICAL per 04-PATTERNS.md: import from client/src/utils/heroMapper — NOT '@shared/heroMapper'.
// The @shared version uses Node.js createRequire and breaks Vite bundling.

interface DraftPortraitProps {
  kind: 'pick' | 'ban'
  heroId?: number
}

/**
 * Single 56×56 draft cell. Three visual states per 04-UI-SPEC:
 *  1. Empty slot (heroId undefined OR heroMapper returns null): bordered placeholder.
 *     Identical for picks and bans per D-05.
 *  2. Filled pick: hero portrait only, full opacity.
 *  3. Filled ban:  hero portrait + semi-transparent red X overlay (D-04).
 *
 * Hero identity is preserved under the X (D-04) — do NOT dim the portrait when banned.
 * SVG X is aria-hidden (decorative; semantic is conveyed by the bans row position in
 * the parent DraftColumn).
 */
export default function DraftPortrait({ kind, heroId }: DraftPortraitProps) {
  // heroMapper returns null for id === 0 / undefined / unknown — see RESEARCH §Section 7 / PF-8.
  const heroInfo = heroId !== undefined ? heroMapper(heroId) : null

  if (!heroInfo) {
    // Empty placeholder — D-02 "always show 5+7 slots" + D-05 "same style for picks and bans".
    return (
      <div
        className="w-14 h-14 shrink-0 rounded-sm"
        style={{
          background: '#141414',          // panel token (04-UI-SPEC §Design Tokens)
          border: '1px solid #1e1e1e',    // wire token
        }}
      />
    )
  }

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
            color: '#ef4444',                              // dire token — D-04 ban color
            opacity: 0.75,                                  // UI-SPEC §Ban X Overlay Spec
            filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.7))', // legibility against bright portraits
          }}
        >
          <path d="M4 4 L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M20 4 L4 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      )}
    </div>
  )
}
