/**
 * The one place an event category is given a colour and a name (UI-SPEC 10.5 §2.4, D-4).
 *
 * `MatchEventFeed` and `TimelineScrubber` each used to carry their own map, and the two had
 * drifted apart. Worse, the shipped assignment put three pairs on the same hue: kill and
 * barracks were both red, tower and aegis were both `--color-accent`/`--color-gold` (one
 * value under two names), and teamfight shared violet with roshan. On the scrubber those
 * categories are 3px ticks side by side, so a collision there is not a nuance — it is two
 * different events drawn as the same mark.
 *
 * `barracks` also moves off `--color-danger`: danger means "something went wrong", not
 * "a building fell", and spending the error colour on a data category leaves the app with
 * no colour that only ever means trouble.
 */

export interface EventCategoryStyle {
  label: string
  /** A `var()` reference, so the category re-skins with the token layer. */
  color: string
}

export const EVENT_CATEGORY_STYLE: Record<string, EventCategoryStyle> = {
  kill: { label: 'Kill', color: 'var(--color-dire)' },
  first_blood: { label: 'First blood', color: 'var(--color-dire)' },
  teamfight: { label: 'Teamfight', color: 'var(--color-text-muted)' },
  tower: { label: 'Tower', color: 'var(--color-accent)' },
  building: { label: 'Building', color: 'var(--color-accent)' },
  barracks: { label: 'Barracks', color: 'var(--color-barracks)' },
  roshan: { label: 'Roshan', color: 'var(--color-primary)' },
  aegis: { label: 'Aegis', color: 'var(--color-radiant)' },
}
