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

// The smallest move worth calling a trend, in the METRIC'S OWN UNIT.
//
// It was a flat 2% of the prior average, and a percentage cannot do this job
// because the metrics do not share a scale. 2% of a day's calories is 41 cal,
// which is a rounding error in food logging; 2% of a body weight is 3.4 lb,
// which is a month of good work. The percentage floor was quietly suppressing
// the single most important signal on the page — a client losing 1.6 lb a
// fortnight was being told she was "holding steady" — while waving through
// calorie moves far below what anyone can log accurately.
//
// So the caller names it, because the caller is the only one that knows the
// unit. The fallback is deliberately 0: a metric that does not state a floor
// gets the noise test alone, which is the honest default. See the call sites
// in Dashboard.jsx for the per-metric numbers and why each was chosen.
const DEFAULT_MIN_MATERIAL = 0

// Population standard deviation. The window IS the population here — we are
// describing the spread of the days the client logged, not estimating it for
// some larger set of days they might have logged.
function spread(values) {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

// How much two window averages would differ by chance alone.
//
// This is the thing the first version of this file got wrong, and it got it
// wrong by guessing. A flat 2% band was chosen as "above day-to-day scatter in
// a two-week mean" without ever checking, and the check says otherwise:
// measured on a well-behaved seeded client, daily calories swing by ±262 and
// two 14-day averages wobble by ~99 against a 2% band of 41 cal. The threshold
// sat at less than half the noise, so the arrow pointed somewhere on nothing
// most of the time — a direction the data could not support, rendered with the
// same confidence as a real one.
//
// Standard error of the difference of two means. A client whose intake is
// steady gets a sensitive trend; one whose intake is erratic has to move
// further before the card will claim a direction. That is the honest
// behaviour, and it falls out of their own data rather than a constant.
function noiseFloor(currentValues, priorValues) {
  const a = spread(currentValues)
  const b = spread(priorValues)
  const n = currentValues.length
  const m = priorValues.length
  if (n === 0 || m === 0) return Infinity
  return Math.sqrt((a * a) / n + (b * b) / m)
}

// `samples` is optional so a caller holding only two averages still gets the
// materiality floor; pass the window values to get the noise test too.
export function trendDirection(current, prior, samples, minMaterial = DEFAULT_MIN_MATERIAL) {
  if (current == null || prior == null || prior === 0) return 'none'
  const delta = current - prior
  // A move must clear BOTH bars: bigger than this client's own day-to-day
  // wobble, and big enough that a person could act on it.
  const floor = samples
    ? Math.max(minMaterial, noiseFloor(samples.current, samples.prior))
    : minMaterial
  // `<=`, not `<`. With a floor of 0 — the default, and what a metric that
  // names no materiality threshold gets — an unchanged metric has
  // `Math.abs(0) < 0` evaluate false and fell through to the up/down branch,
  // where `0 > 0` is false, so two identical averages reported a DECLINE.
  if (Math.abs(delta) <= floor) return 'flat'
  return delta > 0 ? 'up' : 'down'
}

// Split a history into two adjacent windows ending today and compare them.
//
// `history` rows carry an `iso` date (YYYY-MM-DD) — not the `MM-DD` label the
// charts plot, which cannot be ordered across a year boundary and cannot be
// windowed by calendar at all. Rows are selected by DATE rather than by
// position, because the arrays are sparse: taking "the last 14 entries" of a
// series with gaps silently reaches back weeks further on one metric than
// another, and the two windows would then cover different spans.
export function windowTrend(history, valueKey, { days = 14, asOf = new Date(), minMaterial } = {}) {
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

  const samples = {
    current: currentRows.map((r) => Number(r[valueKey]) || 0),
    prior: priorRows.map((r) => Number(r[valueKey]) || 0),
  }

  return {
    current,
    prior,
    // Absolute change, in the metric's own unit. A percentage was the first
    // instinct and it is the wrong one for a column holding six different
    // metrics: "+6%" on steps and "+6%" on weight are not comparable quantities,
    // and on weight a percentage is close to meaningless to a human who thinks
    // in pounds. The unit comes from the call site.
    delta: current != null && prior != null ? current - prior : null,
    direction: trendDirection(current, prior, samples, minMaterial),
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
