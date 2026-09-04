import { ErrorBoundary } from 'react-error-boundary'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { SHELL_WIDTH } from './PageShell'
import PrimaryButton from './PrimaryButton'

/**
 * Whole-route error boundary — the page-level sibling of BentoErrorBoundary.
 *
 * BentoErrorBoundary replaces one panel inside a page that is otherwise still standing, so
 * its fallback is a card with a Retry button and the surrounding page carries the reader.
 * At route level there is no surrounding page: a crash there used to leave a single small
 * card floating on an empty screen with no title, no navigation and nothing to click, so
 * the only way out was the browser's back button.
 *
 * The frame is drawn here rather than through PageShell on purpose. PageShell mounts the
 * navigation, which fetches — and a fallback that can itself throw is a fallback that
 * escapes its own boundary.
 *
 * SECURITY (T-11-05): as in BentoErrorBoundary, the fallback renders GENERIC copy only —
 * the caught `error` object / stack is NEVER interpolated into JSX. It is logged to the
 * console via `onError`.
 */
function PageFallback() {
  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      <div className={`${SHELL_WIDTH} pt-16`}>
        <div className="max-w-[560px] flex flex-col items-start gap-4">
          <span aria-hidden className="text-text-dim text-heading">⚠</span>
          {/* UI-SPEC 10.5 §4.1: one title scale for the whole app. This h1 is a page title even
              though it cannot go through PageShell (the shell itself may be what crashed), so it
              carries the same clamp rather than a fifth hand-picked size. */}
          <h1
            className="font-bold leading-none tracking-title"
            style={{ fontSize: 'clamp(1.5rem, 3vw, 2.125rem)' }}
          >
            This page stopped working
          </h1>
          <p className="text-body text-text-dim">
            Something went wrong while drawing this page, so it was stopped rather than left
            half-rendered. Nothing you did caused it and nothing was lost — reloading is
            usually enough. If it keeps happening, the match list is still there.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={() => window.location.reload()}>Reload</PrimaryButton>
            <Link
              to="/"
              /* D-9: 37px; sits in a flex-wrap row beside PrimaryButton. */
              className="inline-flex items-center px-4 py-2 max-sm:min-h-11 rounded-full border border-border
                         text-body text-text-muted transition-colors hover:border-primary hover:text-text"
            >
              Back to live matches
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PageErrorBoundary({
  children,
  resetKeys,
}: {
  children: ReactNode
  resetKeys?: unknown[]
}) {
  return (
    <ErrorBoundary
      FallbackComponent={PageFallback}
      resetKeys={resetKeys}
      onError={(error, info) => console.error('[page-boundary]', error, info.componentStack)}
    >
      {children}
    </ErrorBoundary>
  )
}
