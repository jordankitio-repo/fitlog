// "Am I moving the right way?" — the question My Progress never answered.
//
// The page showed today's numbers and a 30-day bar chart per metric, and left
// the comparison to the reader: thirty bars is a picture of a series, not a
// statement about it. This turns each series into the one sentence a client
// actually wants, the same one Apple's Trends card makes: your average now,
// which way it moved, and by how much against your own recent past.
//
// Deliberately NOT graded. Direction is a fact, not a verdict: up on steps is
// the win, up on calories may be the miss, and `targets` carries no per-metric
// direction to derive a tone from — the same reasoning that keeps the
// "Today vs target" percentage ungraded (B3). The arrow therefore carries the
// METRIC's colour, never a status tone, which is what Apple's own arrows do.

// Average over LOGGED days, not calendar days.
//
// The alternative — dividing by the window length and counting unlogged days as
// zero — makes a trend read as a collapse when the real fact is a gap in
// logging. That is a different question with its own section ("Logging
// consistency"), and merging the two would mean neither number is honest: a
// client who logged four perfect days out of fourteen would see their calories
// "down 71%". `n` is returned so a caller can say how thin the window is.
function averageOf(rows, valueKey) {
  if (rows.length === 0) return null
  const sum = rows.reduce((acc, r) => acc + (Number(r[valueKey]) || 0), 0)
  return sum / rows.length
}

// A move smaller than this fraction of the prior average is NOISE, not a trend.
//
// Without a dead band every row renders an arrow, because two averages over
// real data are never exactly equal — a 0.3% drift would draw the same
// down-arrow as a genuine decline and the column would stop meaning anything.
// 2% is below what any of these metrics can be steered by and above day-to-day
// scatter in a two-week mean.
const FLAT_BAND = 0.02

export function trendDirection(current, prior) {
  if (current == null || prior == null || prior === 0) return 'none'
  const change = (current - prior) / Math.abs(prior)
  if (Math.abs(change) < FLAT_BAND) return 'flat'
  return change > 0 ? 'up' : 'down'
}

// Split a history into two adjacent windows ending today and compare them.
//
// `history` rows carry an `iso` date (YYYY-MM-DD) — not the `MM-DD` label the
// charts plot, which cannot be ordered across a year boundary and cannot be
// windowed by calendar at all. Rows are selected by DATE rather than by
// position, because the arrays are sparse: taking "the last 14 entries" of a
// series with gaps silently reaches back weeks further on one metric than
// another, and the two windows would then cover different spans.
export function windowTrend(history, valueKey, { days = 14, asOf = new Date() } = {}) {
  const end = new Date(asOf)
  end.setHours(12, 0, 0, 0)

  const dayMs = 86400000
  const startCurrent = new Date(end.getTime() - (days - 1) * dayMs)
  const startPrior = new Date(end.getTime() - (days * 2 - 1) * dayMs)

  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const curFrom = ymd(startCurrent)
  const priFrom = ymd(startPrior)
  const curTo = ymd(end)

  const rows = (history || []).filter((r) => r.iso)
  const currentRows = rows.filter((r) => r.iso >= curFrom && r.iso <= curTo)
  const priorRows = rows.filter((r) => r.iso >= priFrom && r.iso < curFrom)

  const current = averageOf(currentRows, valueKey)
  const prior = averageOf(priorRows, valueKey)

  return {
    current,
    prior,
    // Absolute change, in the metric's own unit. A percentage was the first
    // instinct and it is the wrong one for a column holding six different
    // metrics: "+6%" on steps and "+6%" on weight are not comparable quantities,
    // and on weight a percentage is close to meaningless to a human who thinks
    // in pounds. The unit comes from the call site.
    delta: current != null && prior != null ? current - prior : null,
    direction: trendDirection(current, prior),
    days,
    nCurrent: currentRows.length,
    nPrior: priorRows.length,
  }
}

// Enough of a window on both sides to be worth a sentence.
//
// With one logged day either side the "average" is that day, and the arrow
// reports the difference between two single readings as a trend. Three is the
// floor at which a mean starts absorbing a single odd day.
export function hasTrend(t) {
  return Boolean(t) && t.nCurrent >= 3 && t.nPrior >= 3 && t.direction !== 'none'
}
