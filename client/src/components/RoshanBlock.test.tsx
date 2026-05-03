import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import RoshanBlock from './RoshanBlock'

// Phase 9 Plan 09-01 Wave 0 — RED component tests for RoshanBlock.
// Until plan 05 creates RoshanBlock.tsx the import above fails and this suite is RED.
// Drives D-10..D-14 from 09-CONTEXT.md.

afterEach(() => {
  vi.useRealTimers()
})

describe('RoshanBlock', () => {
  it('renders nothing when roshan === null', () => {
    const { container } = render(<RoshanBlock roshan={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('alive state — shows ROSHAN #N (next kill #) and >=2 loot icons', () => {
    render(
      <RoshanBlock
        roshan={{ killCount: 1, alive: true, respawnIn: null, lastKillLoot: [117] }}
      />,
    )
    expect(screen.getByText(/ROSHAN\s*#2/i)).toBeTruthy()
    const imgs = document.querySelectorAll('img')
    expect(imgs.length).toBeGreaterThanOrEqual(2)
  })

  it('dead state — shows RESPAWN label + mm:ss countdown', () => {
    render(
      <RoshanBlock
        roshan={{ killCount: 1, alive: false, respawnIn: 300, lastKillLoot: [117] }}
      />,
    )
    expect(screen.getByText(/RESPAWN/i)).toBeTruthy()
    const countdown = screen.getByText(/^[0-5]?\d:[0-5]\d$/)
    expect(countdown.textContent).toBe('5:00')
  })

  it('countdown ticks client-side every 1s (D-14)', () => {
    vi.useFakeTimers()
    render(
      <RoshanBlock
        roshan={{ killCount: 1, alive: false, respawnIn: 300, lastKillLoot: [117] }}
      />,
    )
    expect(screen.getByText('5:00')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText('4:57')).toBeTruthy()
  })

  it('shows LAST DROP row when killCount >= 1', () => {
    render(
      <RoshanBlock
        roshan={{ killCount: 1, alive: true, respawnIn: null, lastKillLoot: [117] }}
      />,
    )
    expect(screen.getByText(/LAST DROP/i)).toBeTruthy()
  })

  it('hides LAST DROP row when killCount === 0', () => {
    render(
      <RoshanBlock
        roshan={{ killCount: 0, alive: true, respawnIn: null, lastKillLoot: null }}
      />,
    )
    expect(screen.queryByText(/LAST DROP/i)).toBeNull()
  })
})
