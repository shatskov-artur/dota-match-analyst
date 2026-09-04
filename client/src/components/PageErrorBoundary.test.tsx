import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { PageErrorBoundary } from './PageErrorBoundary'

// The page-level sibling of BentoErrorBoundary. Same security contract (T-11-05: never put
// the caught error in the DOM), different job: this fallback is the ENTIRE screen, so it has
// to leave the reader somewhere to go — a route crash used to end at a dead black page.
//
// React logs the caught render error to console.error even when a boundary handles it.
// Silence that expected noise so the suite output stays clean.
afterEach(() => {
  vi.restoreAllMocks()
})

function Thrower(): never {
  throw new Error('boom-secret-stack-detail')
}

function renderBoundary(children: ReactNode) {
  return render(
    <MemoryRouter>
      <PageErrorBoundary>{children}</PageErrorBoundary>
    </MemoryRouter>,
  )
}

describe('PageErrorBoundary', () => {
  it('renders children untouched when nothing throws', () => {
    renderBoundary(<div>the page</div>)
    expect(screen.getByText('the page')).toBeTruthy()
  })

  it('gives a crashed route a way out — Reload and a link home', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderBoundary(<Thrower />)

    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy()
    const home = screen.getByRole('link', { name: /live matches/i })
    expect(home.getAttribute('href')).toBe('/')
  })

  it('explains itself in plain words rather than showing a blank screen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderBoundary(<Thrower />)
    expect(screen.getByRole('heading', { name: /stopped working/i })).toBeTruthy()
  })

  it('never renders the thrown error message / stack to the UI (SECURITY T-11-05)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderBoundary(<Thrower />)
    expect(document.body.textContent).not.toContain('boom-secret-stack-detail')
  })

  it('logs the error to the console instead, where it belongs', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderBoundary(<Thrower />)
    expect(spy.mock.calls.some((args) => args[0] === '[page-boundary]')).toBe(true)
  })
})
