import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useState } from 'react'
import { BentoErrorBoundary } from './BentoErrorBoundary'

// Phase 11 Plan 11-02 Wave 0 — RED component tests for BentoErrorBoundary.
// Drives ROADMAP criterion 1 (per-card isolation) + SECURITY T-11-05 (no stack in UI).
// Until BentoErrorBoundary.tsx exists the import above fails and this suite is RED.

// React logs the caught render error to console.error even when a boundary handles it.
// Silence that expected noise so the suite output stays clean (RoshanBlock-style spy/restore).
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function Thrower(): never {
  throw new Error('boom')
}

describe('BentoErrorBoundary', () => {
  it('renders the bento fallback with a Retry button when a child throws (criterion 1)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <BentoErrorBoundary>
        <Thrower />
      </BentoErrorBoundary>,
    )
    expect(screen.getByText(/couldn't load/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })

  it('isolates siblings — a failing boundary does not blank a healthy one (criterion 1, T-11-06)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <div>
        <BentoErrorBoundary>
          <Thrower />
        </BentoErrorBoundary>
        <BentoErrorBoundary>
          <div>OK</div>
        </BentoErrorBoundary>
      </div>,
    )
    expect(screen.getByText(/couldn't load/i)).toBeTruthy()
    expect(screen.getByText('OK')).toBeTruthy()
  })

  it('re-mounts children when Retry is clicked (criterion 1b)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let shouldThrow = true
    function FlakyChild() {
      const [n] = useState(0)
      void n
      if (shouldThrow) {
        throw new Error('boom')
      }
      return <div>recovered</div>
    }
    render(
      <BentoErrorBoundary>
        <FlakyChild />
      </BentoErrorBoundary>,
    )
    // Fallback is showing.
    expect(screen.getByText(/couldn't load/i)).toBeTruthy()
    // Next render should succeed.
    shouldThrow = false
    act(() => {
      screen.getByRole('button', { name: /retry/i }).click()
    })
    expect(screen.getByText('recovered')).toBeTruthy()
    expect(screen.queryByText(/couldn't load/i)).toBeNull()
  })

  it('never renders the thrown error message / stack to the UI (SECURITY T-11-05)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <BentoErrorBoundary>
        <Thrower />
      </BentoErrorBoundary>,
    )
    // Generic copy only — the thrown 'boom' message must not reach the DOM.
    expect(screen.queryByText(/boom/)).toBeNull()
    expect(document.body.textContent).not.toContain('boom')
  })
})
