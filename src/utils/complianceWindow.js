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
export const ADHERENCE_WINDOWS = [
  { key: '3m', label: '3m', days: 90, name: 'Last 3 months' },
  { key: '6m', label: '6m', days: 182, name: 'Last 6 months' },
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

// Below this the grid cannot fill a desktop card without cells growing into
// squares you could read from across the room, so the card keeps the summary
// BESIDE it; at or above it the grid takes the full width and the summary
// moves underneath. The threshold is a layout fact about the cap in
// ComplianceHeatmap, not a taste.
export const WIDE_FROM_WEEKS = 26
