import { heroMapper } from '../utils/heroMapper'
// CRITICAL per CLAUDE.md: import from client/src/utils/heroMapper — NOT '@shared/heroMapper'.

import type { DraftTimelineSlot } from '../utils/draftOrder'

// Steps where a new CM 7.40 phase begins (0-indexed). Dividers render BEFORE these steps.
// Step 0 has no divider (it's the very first slot).
const PHASE_DIVIDER_BEFORE = new Set([7, 11, 16, 20, 22])

interface DraftTimelineProps {
  slots: DraftTimelineSlot[]   // always 24 entries (non-null guaranteed by caller)
  gameState: number | undefined
}

/**
 * Single horizontal row of 24 CM 7.40 draft slots in global pick/ban order.
 * Each slot shows: step number (above), 48×48 portrait cell, team label (below).
 * Bans have a red X overlay. The active next-to-fill slot pulses with ember glow.
 * Phase transitions are marked by a thin vertical divider.
 */
export default function DraftTimeline({ slots, gameState }: DraftTimelineProps) {
  const isDraft = gameState === 2

  return (
    <div className="flex items-end gap-1 flex-wrap">
      {slots.map((slot) => {
        const heroInfo = slot.heroId !== undefined ? heroMapper(slot.heroId) : null
        const teamColor = slot.team === 0 ? '#4ade80' : '#ef4444'
        const isActiveEmpty = slot.isActive && isDraft && !heroInfo
        const showDivider = PHASE_DIVIDER_BEFORE.has(slot.step)

        return (
          <div key={slot.step} className="relative flex flex-col items-center" style={{ gap: 2 }}>
            {/* Phase divider — thin vertical rule on left edge of first slot in new phase */}
            {showDivider && (
              <div
                style={{
                  position: 'absolute',
                  left: -4,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: '#2a2a2a',
                }}
              />
            )}

            {/* Step number above portrait */}
            <span
              style={{
                fontSize: 8,
                lineHeight: 1,
                color: '#444',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.02em',
              }}
            >
              {slot.step + 1}
            </span>

            {/* Portrait cell — 48×48 (w-12 h-12) to fit all 24 slots in one row */}
            <div
              className={`relative w-12 h-12 shrink-0 rounded-sm overflow-hidden${isActiveEmpty ? ' animate-pulse' : ''}`}
              style={{
                background: '#141414',
                border: isActiveEmpty
                  ? '1px solid rgba(176,48,48,0.8)'
                  : '1px solid #1e1e1e',
              }}
            >
              {heroInfo && (
                <>
                  <img
                    src={heroInfo.portrait}
                    alt={heroInfo.name}
                    className="w-full h-full object-cover"
                  />
                  {slot.action === 'ban' && (
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
                      <path
                        d="M4 4 L20 20"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        fill="none"
                      />
                      <path
                        d="M20 4 L4 20"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        fill="none"
                      />
                    </svg>
                  )}
                </>
              )}
            </div>

            {/* Team indicator label below portrait */}
            <span
              style={{
                fontSize: 8,
                lineHeight: 1,
                fontWeight: 700,
                color: teamColor,
                letterSpacing: '0.05em',
              }}
            >
              {slot.team === 0 ? 'R' : 'D'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
