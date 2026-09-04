import { ErrorBoundary, type FallbackProps } from 'react-error-boundary'
import type { ReactNode } from 'react'

// Per-bento-card error boundary (react-error-boundary v6).
// SECURITY (T-11-05): the fallback renders GENERIC copy only — the caught `error`
// object / stack is NEVER interpolated into JSX. It is logged to console via `onError`.
function BentoFallback({ resetErrorBoundary }: FallbackProps) {
  return (
    <div className="bento-card flex flex-col items-center justify-center gap-2 text-center">
      <span aria-hidden className="text-text-dim">⚠</span>
      <p className="text-body-lg text-text">Couldn't load this panel.</p>
      <button
        onClick={resetErrorBoundary}
        /* D-9 (§6.3): a bare 11px text button is a ~38×13 tap target. */
        className="text-label uppercase tracking-label text-text-dim hover:text-primary
                   max-sm:inline-flex max-sm:items-center max-sm:justify-center max-sm:min-h-11 max-sm:min-w-11"
      >
        Retry
      </button>
    </div>
  )
}

export function BentoErrorBoundary({
  children,
  resetKeys,
}: {
  children: ReactNode
  resetKeys?: unknown[]
}) {
  return (
    <ErrorBoundary
      FallbackComponent={BentoFallback}
      resetKeys={resetKeys}
      onError={(error, info) => console.error('[bento-boundary]', error, info.componentStack)}
    >
      {children}
    </ErrorBoundary>
  )
}
