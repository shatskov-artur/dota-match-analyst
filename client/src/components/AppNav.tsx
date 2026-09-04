import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { IS_DEMO } from '../lib/apiFetch'
import { useArchiveStatus, useTournaments, type Tournament } from '../hooks/useArchive'

/**
 * The main menu, rendered inline in PageShell's chrome row next to the brand.
 *
 * Only two things are promoted: the live grid, and the tournaments actually being
 * recorded. Everything else the ingest job happens to see goes behind one button.
 *
 * That split is the point. Schedules are synced for every league currently being played,
 * which on a busy evening is a dozen amateur events — the header grew to a wrapping wall
 * of "Mad Dogs League", "Cama 2026", "杀波大会" that pushed the one tournament being
 * archived off to the side. Which leagues matter is already stated in TRACKED_LEAGUE_IDS;
 * the nav now says the same thing.
 */

function useTrackedFirst(): { primary: Tournament[]; rest: Tournament[] } {
  const tournaments = useTournaments()
  const status = useArchiveStatus()
  const all = tournaments.data?.tournaments ?? []
  const tracked = new Set(status.data?.trackedLeagueIds ?? [])
  // No tracked list means "record everything", so nothing is more important than anything
  // else and the menu holds the lot rather than promoting an arbitrary few.
  if (tracked.size === 0) return { primary: [], rest: all }
  return {
    primary: all.filter((t) => tracked.has(t.leagueId)),
    rest: all.filter((t) => !tracked.has(t.leagueId)),
  }
}

// D-9 (§6.3): 29px tall; the nav row is flex-wrap, so it absorbs the extra height.
const pill = (active: boolean) =>
  'px-3 py-1 max-sm:min-h-11 inline-flex items-center rounded-full border text-body whitespace-nowrap transition-colors ' +
  (active
    ? 'border-primary text-text bg-[var(--color-primary-soft)]'
    : 'border-border text-text-muted hover:border-primary hover:text-text')

function OtherTournaments({ leagues }: { leagues: Tournament[] }) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Close on navigation and on a click anywhere else — a menu that stays open after you
  // have used it is the classic way one of these becomes annoying.
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (leagues.length === 0) return null
  const activeHere = leagues.some((t) => pathname.startsWith(`/tournament/${t.leagueId}`))

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={pill(activeHere || open) + ' inline-flex items-center gap-1.5'}
      >
        Tournaments
        <span className="text-label text-text-dim">{leagues.length}</span>
        {/* UI-SPEC 10.5 §4.2: a disclosure caret is a decorative glyph, not text — it carries no
            information the aria-expanded state does not already carry. Its 8px is a glyph
            dimension (§3), so it stays off the prose scale rather than becoming an 11px label. */}
        <span
          aria-hidden="true"
          className={'transition-transform ' + (open ? 'rotate-90' : '')}
          style={{ fontSize: 8 }}
        >
          ▶
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+6px)] z-30 min-w-[240px] max-h-[60vh] overflow-y-auto scroll-slim
                     rounded-sm border border-border bg-bg-elev p-1.5 shadow-[0_12px_32px_var(--scrim-soft)]"
        >
          {leagues.map((t) => (
            <Link
              key={t.leagueId}
              to={`/tournament/${t.leagueId}`}
              role="menuitem"
              className={
                /* D-9: 31px rows in a vertical menu — height is free here. `truncate` moves
                   to the inner span because the anchor is now a flex box and text-overflow
                   only ellipsises the block box that owns the text. */
                'flex items-center rounded-sm px-2.5 py-1.5 max-sm:min-h-11 text-body transition-colors ' +
                (pathname.startsWith(`/tournament/${t.leagueId}`)
                  ? 'bg-[var(--color-primary-soft)] text-text'
                  : 'text-text-muted hover:bg-surface hover:text-text')
              }
            >
              <span className="truncate">{t.name ?? `League #${t.leagueId}`}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AppNav() {
  const { pathname } = useLocation()
  const { primary, rest } = useTrackedFirst()

  return (
    <nav className="flex flex-wrap items-center gap-2 min-w-0" aria-label="Main">
      {/*
       * One entry for the match list, not one per status.
       *
       * Live and Upcoming briefly lived here as well as in the page's own filter bar, so
       * the same two words appeared twice on screen, six centimetres apart, doing subtly
       * different things. The nav answers "where am I" — the match list, or a tournament.
       * Which matches to show is a filter, and filters belong to the page.
       */}
      <Link to="/" className={pill(pathname === '/')}>
        Matches
      </Link>
      {/*
       * Shown in the demo build too. It used to be hidden there because the offline
       * snapshot held no archive at all; it now carries one tournament's full export, and
       * this pill is the only way to reach it.
       */}
      {primary.map((t) => (
        <Link
          key={t.leagueId}
          to={`/tournament/${t.leagueId}`}
          className={pill(pathname.startsWith(`/tournament/${t.leagueId}`))}
        >
          {t.name ?? `League #${t.leagueId}`}
        </Link>
      ))}
      {/*
       * Not on the match list, where the same fifty names are already in the rail
       * beside the calendar — with counts, and filtering in place rather than
       * navigating away. Two controls over one noun, six centimetres apart, doing
       * different things is the collision this nav was cleaned up for once already.
       * Everywhere else it is still the only way to reach another tournament.
       *
       * And never in the demo: /api/tournaments answers there from the recorded league
       * list, so the menu would offer fifty tournaments the export holds no bracket,
       * schedule or match for. The one that was exported is already a pill above.
       */}
      {pathname !== '/' && !IS_DEMO && <OtherTournaments leagues={rest} />}
    </nav>
  )
}
