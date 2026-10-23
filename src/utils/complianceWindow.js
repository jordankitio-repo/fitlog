// The adherence grid's span, and what a hover picks out of it.
//
// THE SPAN IS FIXED, AND THAT IS THE WHOLE POINT.
//
// This started as a window control — 3m/6m/1y — and the grid reshaped under
// every press. It had to: the grid is seven rows of square cells, so its width
// is weeks x cell size. Hold the width to the card and the cell size falls out
// of the span, which means a short span cannot fill a desktop card at all (at
// the 1,066px content column a month is five 266px squares in a grid 1,862px
// tall). Capping the cell instead made the GRID shrink, so the three views sat
// at three different widths and toggling them moved everything.
//
// ChatGPT's usage grid — the comparison this was reaching for — never jumps
// because it never changes span. Twelve months, always. Its control changes
// what a cell MEANS, not how many there are.
//
// So: one span, and the control is granularity. Six months is the span because
// 26 columns fill the card at a cell size you can still hit with a mouse, and
// because it is long enough to hold a coaching phase.
// ONE WINDOW, AT EVERY WIDTH.
//
// This was two tiers — six months on a wide screen, three on a narrow one —
// because the grid is seven rows of square cells, so its width is weeks x cell
// size and a long window cannot stay legible on a phone. The cost was a card
// that quoted a different span depending on how wide the browser happened to
// be: a data window moving for a reason that has nothing to do with the data.
//
// Three months, chosen at the narrow end where the constraint actually bites:
// 13 columns is 18px cells at 360px, and 34px capped on a desktop. It also
// agrees with "Best week (last 90 days)" in the same section, so the card
// stops naming two different spans.
//
// The cap leaves the grid about 494px on a desktop. The summary and the
// weekday breakdown sit in that space rather than under it (.cv-adherence-row),
// so a short window costs no width.
export const ADHERENCE_DAYS = 91
export const ADHERENCE_WEEKS = 13
export const ADHERENCE_NAME = 'last 3 months'
// One fetch, a week of slack past the window: the grid's first column starts on
// a Sunday rather than exactly N days ago.
export const ADHERENCE_FETCH_DAYS = 91

// Daily reads a day; weekly reads a week. Both are real coaching questions and
// the second is the one a weekly review actually asks — "how was that week"
// is not answerable by hovering seven cells one at a time.
export const GRAINS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
]
export const DEFAULT_GRAIN = 'daily'
export const isGrain = (v) => GRAINS.some(g => g.key === v)
