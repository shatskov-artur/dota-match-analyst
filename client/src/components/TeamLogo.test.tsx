import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import TeamLogo, { teamInitials, UNKNOWN_TEAM_GLYPH } from './TeamLogo'

afterEach(cleanup)

describe('teamInitials', () => {
  it('takes the first letter of the first two words', () => {
    expect(teamInitials('Team Liquid')).toBe('TL')
    expect(teamInitials('Team Best of me #nevergiveup')).toBe('TB')
  })

  it('takes two characters from a single-word name', () => {
    expect(teamInitials('Tundra')).toBe('TU')
  })

  it('uses a neutral glyph for a missing name or an unslotted TBD team', () => {
    expect(teamInitials(undefined)).toBe(UNKNOWN_TEAM_GLYPH)
    expect(teamInitials('   ')).toBe(UNKNOWN_TEAM_GLYPH)
    // A qualifier grid is mostly TBD; "TB" badges everywhere would read as real teams.
    expect(teamInitials('TBD')).toBe(UNKNOWN_TEAM_GLYPH)
  })
})

describe('TeamLogo', () => {
  it('renders the logo image when the BFF resolved one', () => {
    render(<TeamLogo src="https://cdn.example/liquid.png" name="Team Liquid" side="radiant" />)
    // Queried by testid, not role: alt="" strips the img role on purpose — the team name is
    // rendered next to it at every call site, so the avatar is decorative.
    const img = screen.getByTestId('team-logo-img')
    expect(img.getAttribute('src')).toBe('https://cdn.example/liquid.png')
    expect(screen.queryByTestId('team-monogram')).toBeNull()
  })

  it('renders an initials monogram when the team has no logo', () => {
    render(<TeamLogo src={null} name="Tundra Esports" side="dire" />)
    expect(screen.getByTestId('team-monogram').textContent).toBe('TE')
  })

  it('swaps to the monogram when the image fails to load (dead Steam asset)', () => {
    render(<TeamLogo src="https://cdn.example/gone.png" name="Team Liquid" side="radiant" />)
    fireEvent.error(screen.getByTestId('team-logo-img'))
    expect(screen.getByTestId('team-monogram').textContent).toBe('TL')
  })

  it('dims the placeholder instead of tinting it as a team on that side', () => {
    render(<TeamLogo src={null} name="TBD" side="radiant" />)
    expect(screen.getByTestId('team-monogram').style.color).toBe('var(--color-text-dim)')
  })

  it('reserves a fixed box so a late or failing logo never shifts the layout', () => {
    render(<TeamLogo src={null} name="Tundra" side="radiant" size={40} />)
    const box = screen.getByTestId('team-logo')
    expect(box.style.width).toBe('40px')
    expect(box.style.height).toBe('40px')
  })
})
