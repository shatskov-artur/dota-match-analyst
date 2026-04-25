import { useState } from 'react'
import { heroMapper } from '../utils/heroMapper'
// CRITICAL per CLAUDE.md: import from client/src/utils/heroMapper — NOT '@shared/heroMapper'.

import { winrateColor } from '../utils/winrateColor'
import IntelTooltip from './IntelTooltip'
import type { DraftTimelineSlot } from '../utils/draftOrder'
import type { HeroStatsEntry } from '../hooks/useHeroStats'
import type { PlayerIntel } from '../hooks/useMatchIntel'

// Steps where a new CM 7.40 phase begins (0-indexed). Dividers render BEFORE these steps.
// Step 0 has no divider (it's the very first slot).
const PHASE_DIVIDER_BEFORE = new Set([7, 11, 16, 20, 22])

interface DraftTimelineProps {
  slots: DraftTimelineSlot[]   // always 24 entries (non-null guaranteed by caller)
  gameState: number | undefined
  heroStatsMap?: Record<number, HeroStatsEntry>   // optional — undefined while loading
  playerIntelMap?: Record<number, PlayerIntel>    // optional — undefined while loading or non-draft
}

/**
 * Single horizontal row of 24 CM 7.40 draft slots in global pick/ban order.
 * Each slot shows: step number (above), 48×48 portrait cell, team label (below).
 * Bans have a red X overlay. The active next-to-fill slot pulses with ember glow.
 * Phase transitions are marked by a thin vertical divider.
 *
 * Phase 5: badge strip on pick slots (DRAFT-03), IntelTooltip on hover (DRAFT-04).
 * CRITICAL (Pitfall 4): IntelTooltip is rendered as sibling to the 48×48 portrait cell
 * (which has overflow-hidden), inside the outer relative flex wrapper (no overflow-hidden).
 * This prevents the tooltip from being clipped by the portrait cell boundary.
 */
export default function DraftTimeline({ slots, gameState, heroStatsMap, playerIntelMap }: DraftTimelineProps) {
  const isDraft = gameState === 2

  // Track which step is hovered — single state for all 24 slots.
  // Using null = no slot hovered, number = step index of hovered slot.
  const [hoveredStep, setHoveredStep] = useState<number | null>(null)

  return (
    <div className="flex items-end gap-1 flex-wrap">
      {slots.map((slot) => {
        const heroInfo = slot.heroId !== undefined ? heroMapper(slot.heroId) : null
        const teamColor = slot.team === 0 ? '#4ade80' : '#ef4444'
        const isActiveEmpty = slot.isActive && isDraft && !heroInfo
        const showDivider = PHASE_DIVIDER_BEFORE.has(slot.step)

        // Phase 5: badge and tooltip conditions
        const heroStats = slot.heroId !== undefined ? heroStatsMap?.[slot.heroId] : undefined
        const playerIntel = slot.heroId !== undefined ? playerIntelMap?.[slot.heroId] : undefined
        const showBadge = slot.action === 'pick' && slot.heroId !== undefined && !!heroInfo && !!heroStats
        const canShowTooltip = slot.action === 'pick' && slot.heroId !== undefined && !!heroInfo && !!playerIntel
        const isHovered = hoveredStep === slot.step

        return (
          <div
            key={slot.step}
            className="relative flex flex-col items-center"
            style={{ gap: 2 }}
            onMouseEnter={() => canShowTooltip && setHoveredStep(slot.step)}
            onMouseLeave={() => setHoveredStep(null)}
          >
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

            {/* Portrait cell — 48×48 (w-12 h-12) to fit all 24 slots in one row.
                overflow-hidden required for image cropping, ban X overlay, and badge strip containment.
                CRITICAL (Pitfall 4): IntelTooltip must NOT be rendered inside this div. */}
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
                  {/* DRAFT-03: badge strip — pick slots only, inside overflow-hidden cell.
                      Timeline uses font-size 9 (smaller than DraftColumn 56×56 which uses 10).
                      Shows winrate only — omit pick count to avoid crowding the 48×48 cell. */}
                  {showBadge && heroStats && (
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: 'rgba(0,0,0,0.72)',
                        padding: '3px',
                        textAlign: 'center',
                        fontSize: 9,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <span style={{ color: winrateColor(heroStats.win_rate) }}>
                        {Math.round(heroStats.win_rate * 100)}%
                      </span>
                    </div>
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

            {/* DRAFT-04: IntelTooltip — sibling to portrait cell, inside outer relative wrapper.
                CRITICAL (Pitfall 4 fix): this outer wrapper has no overflow-hidden, so the
                tooltip (position: absolute) escapes the portrait cell boundary without clipping.
                z-index: 50 is set inside IntelTooltip. */}
            {isHovered && canShowTooltip && playerIntel && heroInfo && (
              <IntelTooltip
                playerIntel={playerIntel}
                heroName={heroInfo.name}
                anchorRef={{ current: null }}
                isLoading={false}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
