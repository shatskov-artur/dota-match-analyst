import { memo, useState } from 'react'
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
    variant === 'neutral' ? { opacity: 0.75, border: '1px solid var(--color-primary)' } : {}

  if (isEmpty) {
    return (
      <div
        className="bg-surface-2"
        style={{ ...baseStyle, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--color-border)', ...neutralStyle }}
        aria-label="Empty item slot"
      />
    )
  }

  // Filled main slots get a subtle gold-tint highlight (UI-SPEC).
  const filledHighlight: React.CSSProperties =
    variant === 'main' ? { boxShadow: 'inset 0 0 0 1px var(--color-primary-soft)' } : {}

  return (
    <img
      src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${name}.png`}
      alt={name}
      width={32}
      height={32}
      style={{ ...baseStyle, ...neutralStyle, ...filledHighlight, display: 'block', objectFit: 'cover' }}
      onError={() => setImgError(true)}
    />
  )
}

function ItemsBlock({ players }: ItemsBlockProps) {
  if (players.length === 0) return null

  // `@container`: the optional neutral/backpack slots gate on this card's width, not the window's.
  return (
    <div className="@container flex flex-col flex-1">
      {/* Section header — matches HeroPlayerGrid label style */}
      <p className="text-label uppercase tracking-micro font-bold mb-4 text-text-dim">
        Items
      </p>

      <div className="flex flex-col justify-between flex-1">
      {players.map((player, index) => {
        const heroInfo = player.hero_id != null ? heroMapper(player.hero_id) : null
        const rankColor = player.team === 'radiant' ? 'var(--color-radiant)' : 'var(--color-dire)'

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
            className="flex items-center border-b border-border transition-colors duration-150 hover:bg-surface-2 min-w-0"
            style={{
              minHeight: 52,
              gap: 8,
            }}
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
                <div className="w-12 h-12 rounded-sm bg-surface" />
              )}
            </div>

            {/* Net worth value — 56px, gold mono per UI-SPEC */}
            <div
              className="font-mono tabular-nums"
              style={{
                width: 56,
                flexShrink: 0,
                fontSize: 12,
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--color-gold)',
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

            {/* Neutral item slot (D-04: show if item_neutral field present).
                Also space-gated: the six main slots are the point of this panel, and a neutral
                slot appearing mid-game must not push them past the card edge. */}
            {hasNeutral && (
              <div className="hidden @min-[400px]:block" style={{ marginLeft: 8 }}>
                <ItemSlot itemId={player.item_neutral} variant="neutral" />
              </div>
            )}

            {/* Backpack group (D-04: show if item6 field present, opacity 0.6) — lowest priority,
                so it needs the most room before it earns its place. */}
            {hasBackpack && (
              <div className="hidden @min-[540px]:flex" style={{ gap: 4, marginLeft: 16, opacity: 0.6 }}>
                <ItemSlot itemId={player.item6} variant="backpack" />
                <ItemSlot itemId={player.item7} variant="backpack" />
                <ItemSlot itemId={player.item8} variant="backpack" />
              </div>
            )}
          </div>
        )
      })}
      </div>
    </div>
  )
}

// Ninety item slots, each resolving an icon URL. Only the match payload can change them.
export default memo(ItemsBlock)
