import { useEffect, useState } from 'react'

interface TeamLogoProps {
  /** Resolved logo URL from the BFF; null/undefined when the team has none. */
  src?: string | null
  /** Team name — the monogram source, not rendered as text. */
  name?: string
  /**
   * Side tint for the monogram. 'neutral' is for contexts with no sides at all —
   * standings, brackets, head-to-head history — where colouring a badge green or red
   * would imply a team allegiance that does not exist outside a live game.
   */
  side?: 'radiant' | 'dire' | 'neutral'
  /** Box size in px. Fixed so a late-loading or failing logo never shifts the layout. */
  size?: number
}

/** Shown instead of initials when there is no team yet — see teamInitials. */
export const UNKNOWN_TEAM_GLYPH = '–'

/**
 * Initials for the monogram fallback: first letters of the first two words, or the first two
 * characters of a single-word name. Exported for unit testing.
 * Team names are frequently sponsor-prefixed and non-latin, so this stays deliberately dumb.
 *
 * Unslotted matches (qualifiers, early brackets) come through as "TBD", which is a placeholder
 * and not a team — initialising it to "TB" would fill a tournament grid with identical badges
 * that look like real teams. Those get a neutral glyph instead.
 */
export function teamInitials(name?: string | null): string {
  const trimmed = (name ?? '').trim()
  if (trimmed === '' || trimmed.toUpperCase() === 'TBD') return UNKNOWN_TEAM_GLYPH

  const words = trimmed.split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/**
 * Team avatar with a guaranteed fallback. Renders the logo when the BFF resolved one and the
 * image actually loads; otherwise an initials monogram tinted to the team's side.
 *
 * Steam's logo hosts 404 often enough (deleted Workshop uploads, rebranded teams) that a broken
 * image icon would be a routine sight without the onError swap — and TBD teams in qualifiers
 * never have a logo at all.
 *
 * Decorative by design: every call site renders the team name next to it, so the image is
 * aria-hidden rather than announced twice.
 */
export default function TeamLogo({ src, name, side = 'neutral', size = 24 }: TeamLogoProps) {
  const [failed, setFailed] = useState(false)

  // Home polls every 30s and tiles get reused across matches — reset the failure flag when the
  // URL changes, or one dead logo would suppress the next team's working one.
  useEffect(() => setFailed(false), [src])

  const showImage = Boolean(src) && !failed
  const initials = teamInitials(name)
  // A placeholder slot is dimmed rather than side-tinted — it is not a team taking that side.
  const monogramColor =
    initials === UNKNOWN_TEAM_GLYPH
      ? 'var(--color-text-dim)'
      : side === 'radiant'
        ? 'var(--color-radiant)'
        : side === 'dire'
          ? 'var(--color-dire)'
          : 'var(--color-text-muted)'

  return (
    <span
      data-testid="team-logo"
      aria-hidden="true"
      className="inline-grid place-items-center shrink-0 rounded-md border border-border bg-surface-2 overflow-hidden"
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <img
          data-testid="team-logo-img"
          src={src!}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="w-full h-full object-contain p-0.5"
        />
      ) : (
        <span
          data-testid="team-monogram"
          className="font-bold leading-none"
          style={{ color: monogramColor, fontSize: Math.round(size * 0.4) }}
        >
          {initials}
        </span>
      )}
    </span>
  )
}
