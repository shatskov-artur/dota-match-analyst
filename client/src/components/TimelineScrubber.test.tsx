import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TimelineScrubber from './TimelineScrubber'
import { useTimelineCursor } from '../store/timelineCursor'
import type { MatchEvent } from '../hooks/useArchive'

const ev = (t: number, type: string): MatchEvent => ({ id: t, t, type, team: null, payload: null, source: 'live' })

const slider = () => screen.getByRole('slider') as HTMLInputElement

/** A finished, fully archived match — enough range to drag across. */
const base = { lastMinute: 30, currentMinute: 30, events: [] as MatchEvent[], isLiveMatch: false }

beforeEach(() => {
  // Open by default: almost every test here exercises the controls, and they live in the
  // floating player. The suite that covers opening and closing sets this back itself.
  useTimelineCursor.setState({ minute: 'live', playing: false, matchId: null, timelineOpen: true, floatPos: null })
})

describe('TimelineScrubber — live vs scrubbing', () => {
  it('shows the live badge and no back-to-live action while following the clock', () => {
    render(<TimelineScrubber lastMinute={30} currentMinute={12} events={[]} isLiveMatch />)
    expect(screen.getByText('● Live')).toBeTruthy()
  })

  it('labels a finished match Final rather than Live', () => {
    render(<TimelineScrubber lastMinute={30} currentMinute={30} events={[]} isLiveMatch={false} />)
    expect(screen.getByText('Final')).toBeTruthy()
  })

  it('moving the slider parks the cursor on that minute', () => {
    render(<TimelineScrubber lastMinute={40} currentMinute={40} events={[]} isLiveMatch={false} />)
    fireEvent.change(slider(), { target: { value: '17' } })
    expect(useTimelineCursor.getState().minute).toBe(17)
    expect(screen.getByText('17:00')).toBeTruthy()
  })

  it('Back to live returns the cursor to the live clock', () => {
    useTimelineCursor.setState({ minute: 9 })
    render(<TimelineScrubber lastMinute={40} currentMinute={40} events={[]} isLiveMatch />)
    fireEvent.click(screen.getByText('Back to live'))
    expect(useTimelineCursor.getState().minute).toBe('live')
  })
})

describe('TimelineScrubber — clamping', () => {
  it('never places the handle past the last archived minute', () => {
    // The live clock legitimately runs ahead of the archive: the recorder writes every
    // 30s, and may not be recording this league at all.
    render(<TimelineScrubber lastMinute={13} currentMinute={20} events={[]} isLiveMatch />)
    expect(Number(slider().value)).toBe(13)
  })

  it('still shows the true live clock and says how far the archive reaches', () => {
    render(<TimelineScrubber lastMinute={13} currentMinute={20} events={[]} isLiveMatch />)
    expect(screen.getByText('20:00')).toBeTruthy()
    expect(screen.getByText(/archived to 13:00/)).toBeTruthy()
  })

  it('steps stay inside the archived range', () => {
    useTimelineCursor.setState({ minute: 40 })
    render(<TimelineScrubber lastMinute={40} currentMinute={40} events={[]} isLiveMatch={false} />)
    fireEvent.click(screen.getByLabelText('Next minute'))
    expect(useTimelineCursor.getState().minute).toBe(40)
    fireEvent.click(screen.getByLabelText('Previous minute'))
    expect(useTimelineCursor.getState().minute).toBe(39)
  })
})

describe('TimelineScrubber — nothing to scrub', () => {
  it('renders nothing when the match is not archived', () => {
    const { container } = render(
      <TimelineScrubber lastMinute={null} currentMinute={null} events={[]} isLiveMatch />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when only minute 0 exists — a one-position slider is furniture', () => {
    const { container } = render(<TimelineScrubber lastMinute={0} currentMinute={0} events={[]} isLiveMatch />)
    expect(container.firstChild).toBeNull()
  })

  it('appears as soon as there is a range to drag across', () => {
    render(<TimelineScrubber lastMinute={1} currentMinute={1} events={[]} isLiveMatch />)
    expect(screen.getByRole('slider')).toBeTruthy()
  })
})

describe('TimelineScrubber — event ticks', () => {
  it('marks recognised events on the track', () => {
    const { container } = render(
      <TimelineScrubber
        lastMinute={40}
        currentMinute={40}
        events={[ev(600, 'tower'), ev(1500, 'roshan'), ev(1800, 'barracks')]}
        isLiveMatch={false}
      />,
    )
    expect(container.querySelectorAll('[title*="@"]')).toHaveLength(3)
  })

  it('collapses several events of one type in the same minute into one tick', () => {
    const { container } = render(
      <TimelineScrubber lastMinute={40} currentMinute={40} events={[ev(600, 'tower'), ev(620, 'tower')]} isLiveMatch={false} />,
    )
    expect(container.querySelectorAll('[title*="@"]')).toHaveLength(1)
  })

  it('ignores draft picks and bans, which sit before the game clock starts', () => {
    const { container } = render(
      <TimelineScrubber lastMinute={40} currentMinute={40} events={[ev(-1000, 'pick'), ev(-999, 'ban')]} isLiveMatch={false} />,
    )
    expect(container.querySelectorAll('[title*="@"]')).toHaveLength(0)
  })
})

describe('TimelineScrubber — snapshot coverage', () => {
  it('warns when the requested minute predates the first stored snapshot', () => {
    useTimelineCursor.setState({ minute: 2 })
    render(
      <TimelineScrubber
        lastMinute={40}
        currentMinute={2}
        events={[]}
        isLiveMatch={false}
        snapshotRange={{ minMinute: 12, maxMinute: 40 }}
      />,
    )
    expect(screen.getByText(/earliest recorded state/)).toBeTruthy()
  })

  it('stays quiet when the minute is inside the recorded range', () => {
    useTimelineCursor.setState({ minute: 20 })
    render(
      <TimelineScrubber
        lastMinute={40}
        currentMinute={20}
        events={[]}
        isLiveMatch={false}
        snapshotRange={{ minMinute: 12, maxMinute: 40 }}
      />,
    )
    expect(screen.queryByText(/earliest recorded state/)).toBeNull()
  })
})

describe('TimelineScrubber — opening', () => {
  beforeEach(() => useTimelineCursor.setState({ timelineOpen: false }))

  /**
   * Most visits never scrub, so the control is a button until it is wanted. Sitting in the
   * page full-width it took a slab of screen from everyone to serve the few, and fixed to
   * the top of the viewport it was in the way of the same majority.
   */
  it('is only a button until asked for', () => {
    render(<TimelineScrubber {...base} />)
    expect(screen.getByTestId('timeline-open')).toBeTruthy()
    expect(screen.queryByTestId('timeline-scrubber')).toBeNull()
    expect(screen.queryByLabelText('Match minute')).toBeNull()
  })

  it('opens as a movable player', () => {
    render(<TimelineScrubber {...base} />)
    fireEvent.click(screen.getByTestId('timeline-open'))
    expect(screen.getByTestId('timeline-scrubber').dataset.floating).toBe('true')
    expect(screen.getByTestId('timeline-drag-handle')).toBeTruthy()
  })

  it('closes back to the button', () => {
    render(<TimelineScrubber {...base} />)
    fireEvent.click(screen.getByTestId('timeline-open'))
    fireEvent.click(screen.getByLabelText('Close timeline'))
    expect(screen.getByTestId('timeline-open')).toBeTruthy()
    expect(screen.queryByTestId('timeline-scrubber')).toBeNull()
  })

  it('scrubs from the floating player', () => {
    render(<TimelineScrubber {...base} />)
    fireEvent.click(screen.getByTestId('timeline-open'))
    fireEvent.change(screen.getByLabelText('Match minute'), { target: { value: '7' } })
    expect(useTimelineCursor.getState().minute).toBe(7)
  })
})
