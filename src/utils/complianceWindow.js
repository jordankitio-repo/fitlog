// How far back the adherence block reads.
//
// It was a constant: 97 days fetched, 13 weeks drawn, "last 90 days" printed
// in three places. chartRange.js already settled whose call a window is —
// "a choice this cheap to change belongs on a control that is already on
// screen" — and this was the one card on the page still answering that
// question with a number picked in advance.
//
// The window drives the fetch, the grid, the summary's counts, the weekday
// breakdown AND every label that names a span, so the picture and the sentence
// describe the same days by construction rather than by three constants being
// kept in step by hand.
// WHY THESE THREE, AND WHY NONE OF THEM IS SHORT
//
// The grid is seven rows of square cells, so its width is weeks x cell size.
// Fix the width to the card and the cell size falls out of the window — which
// means a short window cannot fill a desktop card at all. At the 1,066px
// content column a month is five 266px squares and a grid 1,862px tall; a
// quarter is 82px squares and 574px tall. Both are absurd, which is why the
// first cut of this capped the cell and let the GRID shrink instead — and that
// is what made the three views jump between widths as you toggled them.
//
// So every window here is long enough to fill the card. The grid is the same
// length in all three; only the cell size changes (41px, 27px, 20px). Nothing
// reflows, nothing falls back to a narrower layout, and there is no dead space
// to the right of a short one.
//
// The cost is honest: there is no 3m any more, and a quarter is a real
// coaching review cycle. It is not recoverable at this width without bringing
// the jumping back.
export const ADHERENCE_WINDOWS = [
  { key: '6m', label: '6m', days: 182, name: 'Last 6 months' },
  { key: '9m', label: '9m', days: 273, name: 'Last 9 months' },
  { key: '1y', label: '1y', days: 364, name: 'Last 12 months' },
]

export const DEFAULT_ADHERENCE = '6m'

export function adherenceByKey(key) {
  return ADHERENCE_WINDOWS.find(w => w.key === key)
    || ADHERENCE_WINDOWS.find(w => w.key === DEFAULT_ADHERENCE)
}

// Whole weeks, because the grid is a week per column and a partial column at
// the left edge would mislabel its month.
export const weeksFor = (days) => Math.round(days / 7)

