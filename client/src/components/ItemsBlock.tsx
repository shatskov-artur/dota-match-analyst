import { useState } from 'react'
import { heroMapper } from '../utils/heroMapper'
import { itemMapper } from '../utils/itemMapper'
import { formatNW } from '../utils/formatNW'

interface PlayerItem {
  hero_id?: number
  account_id?: number
  team: 'radiant' | 'dire'
  net_worth?: number
  item0?: number; item1?: number; item2?: number
  item3?: number; item4?: number; item5?: number
  item_neutral?: number
  item6?: number; item7?: number; item8?: number
  [key: string]: unknown
}

interface ItemsBlockProps {
  players: PlayerItem[]
}

// Renders one item slot: item icon OR dark placeholder square.
// variant='neutral' applies gold border + 75% opacity (D-04).
// variant='backpack' — opacity set on parent group, not per-slot.
function ItemSlot({ itemId, variant = 'main' }: { itemId?: number; variant?: 'main' | 'neutral' | 'backpack' }) {
  const name = itemId != null && itemId !== 0 ? itemMapper(itemId) : null
  const [imgError, setImgError] = useState(false)
  const isEmpty = !name || imgError

  const baseStyle: React.CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: 4,
    flexShrink: 0,
  }

  const neutralStyle: React.CSSProperties =
    variant === 'neutral' ? { opacity: 0.75, border: '1px solid #888866' } : {}

  if (isEmpty) {
    return (
      <div
        style={{ ...baseStyle, background: '#1a1a1a', border: '1px solid #2a2a2a', ...neutralStyle }}
        aria-label="Empty item slot"
      />
    )
  }

  return (
    <img
      src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${name}.png`}
      alt={name}
      width={32}
      height={32}
      style={{ ...baseStyle, ...neutralStyle, display: 'block', objectFit: 'cover' }}
      onError={() => setImgError(true)}
    />
  )
}

export default function ItemsBlock({ players }: ItemsBlockProps) {
  if (players.length === 0) return null

  return (
    <div>
      {/* Section header — matches HeroPlayerGrid label style */}
      <p
        className="text-[10px] uppercase tracking-[0.3em] font-bold mb-4"
        style={{ color: '#555555' }}
      >
        Items
      </p>

      {players.map((player, index) => {
        const heroInfo = player.hero_id != null ? heroMapper(player.hero_id) : null
        const rankColor = player.team === 'radiant' ? '#4ade80' : '#ef4444'

        // Main slots: item0-item5 (always rendered, 6 slots)
        const mainSlots = [
          player.item0, player.item1, player.item2,
          player.item3, player.item4, player.item5,
        ]

        // Neutral slot: only shown if item_neutral field is present (D-04 VERIFY)
        const hasNeutral = player.item_neutral != null

        // Backpack: only shown if item6 field is present (D-04 VERIFY)
        const hasBackpack = player.item6 != null

        return (
          <div
            key={player.account_id ?? player.hero_id ?? index}
            className="flex items-center border-b"
            style={{
              minHeight: 52,
              borderColor: '#1e1e1e',
              gap: 8,
              transition: 'background 160ms ease',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#0f0f0f')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
          >
            {/* Rank number — 24px fixed width, team-colored */}
            <div
              style={{
                width: 24,
                flexShrink: 0,
                fontSize: 12,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: rankColor,
                textAlign: 'right',
              }}
            >
              {index + 1}
            </div>

            {/* Hero portrait — 48x48px, matches PlayerRow pattern */}
            <div className="relative shrink-0" style={{ width: 48 }}>
              {heroInfo ? (
                <img
                  src={heroInfo.portrait}
                  alt={heroInfo.name}
                  className="w-12 h-12 object-cover rounded-sm"
                />
              ) : (
                <div className="w-12 h-12 rounded-sm" style={{ background: '#141414' }} />
              )}
            </div>

            {/* Net worth value — 56px, tabular nums */}
            <div
              style={{
                width: 56,
                flexShrink: 0,
                fontSize: 12,
                fontVariantNumeric: 'tabular-nums',
                color: '#e8e8e8',
              }}
            >
              {formatNW(player.net_worth)}
            </div>

            {/* Main item slots: item0-item5 (6 slots, 4px gap) */}
            <div className="flex" style={{ gap: 4 }}>
              {mainSlots.map((itemId, i) => (
                <ItemSlot key={i} itemId={itemId} variant="main" />
              ))}
            </div>

            {/* Neutral item slot (D-04: show if item_neutral field present) */}
            {hasNeutral && (
              <div style={{ marginLeft: 8 }}>
                <ItemSlot itemId={player.item_neutral} variant="neutral" />
              </div>
            )}

            {/* Backpack group (D-04: show if item6 field present, opacity 0.6) */}
            {hasBackpack && (
              <div className="flex" style={{ gap: 4, marginLeft: 16, opacity: 0.6 }}>
                <ItemSlot itemId={player.item6} variant="backpack" />
                <ItemSlot itemId={player.item7} variant="backpack" />
                <ItemSlot itemId={player.item8} variant="backpack" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
