/**
 * Column geometry shared by PlayerRow and its header row.
 *
 * These MUST stay in lockstep — the header is a separate flex row, so any width that drifts
 * silently unlabels a column of numbers.
 *
 * Measured 2026-08-11: the old layout needed 436px in a 377px card, so LH/DN was clipped and the
 * name column — the only flexible one — was crushed to 0px, hiding every player name. Widths are
 * tightened and the gap dropped from 16px to 8px so the essential columns fit with room to spare.
 *
 * 2026-08-14: eight pixels between right-aligned numbers was geometrically correct and visually
 * wrong — "21 3/6/— 15 541" read as one run of digits with no telling where a column began. Each
 * stat cell now carries a left rule and internal padding, and its width grew by RULE_PAD to pay
 * for it, so the boundaries are drawn rather than implied.
 */
/** Space a stat cell gives up to its own left rule and padding. */
const RULE_PAD = 12

export const COL = {
  portrait: 48,
  lvl: 22 + RULE_PAD,
  kda: 58 + RULE_PAD,
  nw: 52 + RULE_PAD,
  gpm: 32 + RULE_PAD,
  xpm: 32 + RULE_PAD,
  lhdn: 44 + RULE_PAD,
} as const

/**
 * Every stat cell, header and value alike. The rule is what makes a column a column;
 * `box-border` matters because the widths above are set as an inline style and the padding
 * has to come out of them rather than add to them.
 */
export const STAT_CELL = 'shrink-0 text-right border-l border-border box-border pl-2'

/** The name column never shrinks below this — a nameless row defeats the point of the panel. */
export const NAME_MIN_PX = 72

/**
 * Space gating for the optional stat columns, in order of what a viewer gives up first.
 *
 * Container queries rather than viewport breakpoints: this panel is one of three flex siblings, so
 * its width has no fixed relationship to the window. The requirement is `@container` on the grid
 * root — without it these variants never match and the columns stay hidden.
 *
 * Budget at gap-2 with the name floor, each stat column now RULE_PAD wider:
 * base 320px, +GPM 372px, +XPM 424px, +LH/DN 488px.
 * Thresholds sit just above each step so a column only appears once it genuinely fits.
 */
export const SHOW_GPM = 'hidden @min-[376px]:block'
export const SHOW_XPM = 'hidden @min-[428px]:block'
export const SHOW_LHDN = 'hidden @min-[492px]:block'
