import type { ReactNode } from 'react'
import { Link } from 'react-router'
import AppNav from './AppNav'

/**
 * The one page frame every route uses.
 *
 * Before this each page invented its own: Home had a bordered band with a violet 24px
 * title and the nav orphaned in dead space below the divider, Tournament used 8px wider
 * gutters and a clamped 2.4rem title, Match clamped to 2.8rem. Side by side the app read
 * as three products.
 *
 * Structure, top to bottom:
 *   brand · nav pills ································ status
 *   ──────────────────────────────────────────────────────────
 *   Page title                                          meta
 *   toolbar
 *
 * Brand and navigation share one compact row so the divider separates *chrome* from
 * *page*, rather than cutting the header in half with the nav stranded underneath.
 */

export interface PageShellProps {
  /** Main heading, at the single canonical page-title scale. */
  title: ReactNode
  /** Small uppercase line above the title — stage, league, "live match". */
  eyebrow?: ReactNode
  /** Right of the title: prize pool, series score, dates. */
  meta?: ReactNode
  /** Right of the brand row: live count, last-updated. Persistent app status. */
  status?: ReactNode
  /** Under the title: filters, tabs, stream links. */
  toolbar?: ReactNode
  /** Back link, rendered at the far left of the brand row. */
  backTo?: { to: string; label: string }
  /** Ambient glow behind the header. On for a single match, off for list pages. */
  glow?: boolean
  children: ReactNode
}

/** Canonical content width and gutters. Every page, no exceptions. */
export const SHELL_WIDTH = 'max-w-[1320px] mx-auto px-4 md:px-6'

export default function PageShell({
  title,
  eyebrow,
  meta,
  status,
  toolbar,
  backTo,
  glow = false,
  children,
}: PageShellProps) {
  return (
    <div className="min-h-screen bg-bg text-text font-sans relative">
      {glow && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: 0,
            left: 0,
            right: 0,
            height: 280,
            background: 'radial-gradient(ellipse 60% 40% at 50% 0%, var(--color-primary-soft) 0%, transparent 100%)',
          }}
        />
      )}

      <div className={`${SHELL_WIDTH} relative`}>
        {/* Chrome row: identity, navigation and app status on one line. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pt-5 pb-4">
          {backTo && (
            <Link
              to={backTo.to}
              /* D-9 (§6.3): a bare 11px link is ~62×13. The chrome row already carries
                 44px nav pills on phone, so the taller box costs no extra height. */
              className="text-label uppercase tracking-label text-text-dim transition-colors hover:text-primary shrink-0
                         max-sm:inline-flex max-sm:items-center max-sm:min-h-11"
            >
              ← {backTo.label}
            </Link>
          )}
          {!backTo && (
            <Link
              to="/"
              /* D-9, same row and same reasoning as the back link above. */
              className="text-body font-bold uppercase tracking-label text-text-muted transition-colors hover:text-text shrink-0
                         max-sm:inline-flex max-sm:items-center max-sm:min-h-11"
            >
              Dota&nbsp;2 Match Analyst
            </Link>
          )}
          <AppNav />
          {status && <div className="ml-auto flex items-center gap-4 shrink-0">{status}</div>}
        </div>

        <header className="pt-5 pb-6 border-t border-border">
          {eyebrow && (
            <div className="mb-2 text-label uppercase tracking-label text-text-dim">{eyebrow}</div>
          )}
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            {/* One title scale for the whole app; clamp keeps it off a phone's knees. */}
            <h1
              className="font-bold leading-none tracking-title text-text min-w-0"
              style={{ fontSize: 'clamp(1.5rem, 3vw, 2.125rem)' }}
            >
              {title}
            </h1>
            {meta && <div className="ml-auto flex flex-wrap items-baseline gap-x-4 gap-y-1">{meta}</div>}
          </div>
          {toolbar && <div className="mt-5">{toolbar}</div>}
        </header>

        <main className="py-6">{children}</main>
      </div>
    </div>
  )
}

/**
 * Section heading inside a page. The uppercase micro-label every panel already uses,
 * exported so sections cannot drift into ad-hoc sizes.
 */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 mb-3">
      <h2 className="text-label uppercase tracking-label text-text-dim">{children}</h2>
      {aside && <div className="ml-auto text-label text-text-dim">{aside}</div>}
    </div>
  )
}

/** The live-count dot used in the header status slot. */
export function LiveCount({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-label uppercase tracking-label text-text-muted">
      <span className="w-[5px] h-[5px] rounded-full bg-dire animate-pulse" />
      {count} live
    </span>
  )
}
