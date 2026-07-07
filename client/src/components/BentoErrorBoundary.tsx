import { ErrorBoundary, type FallbackProps } from 'react-error-boundary'
import type { ReactNode } from 'react'

// Per-bento-card error boundary (react-error-boundary v6).
// SECURITY (T-11-05): the fallback renders GENERIC copy only — the caught `error`
// object / stack is NEVER interpolated into JSX. It is logged to console via `onError`.
function BentoFallback({ resetErrorBoundary }: FallbackProps) {
  return (
    <div className="bento-card flex flex-col items-center justify-center gap-2 text-center">
      <span aria-hidden className="text-text-dim">⚠</span>
      <p className="text-sm text-text">Couldn't load this panel.</p>
      <button
        onClick={resetErrorBoundary}
        className="text-[11px] uppercase tracking-[0.2em] text-text-dim hover:text-primary"
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
