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
// TWO TIERS, because the grid scales to the viewport rather than scrolling in
// it. Width = weeks x cell size still holds, so on a phone the only way to
// keep a cell legible without a scroller is to draw fewer weeks: 26 columns
// inside ~300px is 9px a cell, which is dots, not a calendar.
//
// The whole window moves with it, not just the grid — the fetch, the summary's
// counts, the weekday breakdown and every label that names a span. A phone
// showing three months of squares above a summary counting six would be the
// drift this file exists to prevent.
export const ADHERENCE = {
  wide: { days: 182, weeks: 26, name: 'last 6 months' },
  narrow: { days: 91, weeks: 13, name: 'last 3 months' },
}
// The longest window any tier asks for, so one fetch serves both and resizing
// across the breakpoint never has to go back to the network.
export const ADHERENCE_FETCH_DAYS = 182

// Daily reads a day; weekly reads a week. Both are real coaching questions and
// the second is the one a weekly review actually asks — "how was that week"
// is not answerable by hovering seven cells one at a time.
export const GRAINS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
]
export const DEFAULT_GRAIN = 'daily'
export const isGrain = (v) => GRAINS.some(g => g.key === v)
