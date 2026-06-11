import { parseLocalDateString } from './dateHelpers'

// Coach-facing "Energy Balance Read": empirical maintenance + weight-rate +
// trajectory, derived from intake vs the weight trend. An INSTRUMENT, not a
// prescription — it surfaces facts and their uncertainty; the coach decides.
//
// Honesty model (see Ai-context/decisions.md):
//  - Maintenance is shown as a RANGE whose width comes from the weight-slope's
//    real regression error — so the band literally widens when weigh-ins are
//    noisy. The width IS the confidence; we never hide it behind a fixed gate.
//  - Coarse floors only exist to avoid computing on garbage (the slope SE is
//    only meaningful with enough points, and avg intake must represent the
//    window or maintenance is biased). They are NOT precision claims.
//  - 3500 cal/lb is a heuristic; early-phase water loss biases the slope and the
//    SE can't see that — hence the "assumes logging accuracy" framing and the
//    soft "still settling" label on a wide band.

const CAL_PER_LB = 3500
const KG_TO_LB = 2.2046226218
const WINDOW_DAYS = 21

// Coarse garbage-guards (not the trust gate — the visible band is that):
const MIN_WEIGH_INS = 8      // below this the slope SE itself is unreliable
const MIN_SPAN_DAYS = 14     // weigh-ins must span enough calendar time to fit a line
const MIN_COVERAGE = 0.7     // logged days / window days — bounds under-logging bias
const MIN_BAND_CAL = 50      // floor on the band — a clean fit still isn't ±1 cal
                             // (3500/lb is a heuristic + systematic water error)
const WIDE_BAND_CAL = 200    // band wider than this → soft "still settling" label

// Ordinary least squares on [{x, y}]. Returns null when a line can't be fit
// (fewer than 2 points, or no variance in x). slopeSE = standard error of slope.
export function linearFit(points) {
  const n = points.length
  if (n < 2) return null
  const meanX = points.reduce((s, p) => s + p.x, 0) / n
  const meanY = points.reduce((s, p) => s + p.y, 0) / n
  let sxx = 0, sxy = 0
  for (const p of points) { sxx += (p.x - meanX) ** 2; sxy += (p.x - meanX) * (p.y - meanY) }
  if (sxx === 0) return null
  const slope = sxy / sxx
  const intercept = meanY - slope * meanX
  let sse = 0
  for (const p of points) { const yhat = intercept + slope * p.x; sse += (p.y - yhat) ** 2 }
  const dof = n - 2
  const slopeSE = dof > 0 ? Math.sqrt((sse / dof) / sxx) : 0
  return { slope, intercept, slopeSE }
}

// Collapse to one weight (in lb) per date, normalizing each entry via its OWN
// unit — so a history that mixes lb and kg entries still fits correctly.
function dailyWeightsLb(weightSeries) {
  const byDate = {}
  for (const w of weightSeries) {
    const raw = Number(w.weight)
    if (!Number.isFinite(raw)) continue
    const lb = w.unit === 'kg' ? raw * KG_TO_LB : raw
    if (!byDate[w.date]) byDate[w.date] = []
    byDate[w.date].push(lb)
  }
  return Object.entries(byDate).map(([date, arr]) => ({
    date, lb: arr.reduce((s, v) => s + v, 0) / arr.length,
  }))
}

function readWindow({ calorieSeries, dailyWeights, today, startAgo, endAgo }) {
  const windowDays = endAgo - startAgo
  const agoOf = (dateStr) => Math.round((today - parseLocalDateString(dateStr)) / 86400000)
  const inWin = (dateStr) => { const a = agoOf(dateStr); return a >= startAgo && a < endAgo }

  const cals = calorieSeries.filter(c => inWin(c.date) && c.calories > 0)
  const loggedDays = cals.length
  const coverage = loggedDays / windowDays
  const avgIntake = loggedDays > 0 ? Math.round(cals.reduce((s, c) => s + c.calories, 0) / loggedDays) : null

  const ws = dailyWeights.filter(w => inWin(w.date))
  const weighIns = ws.length
  let span = 0
  if (weighIns >= 2) {
    const agos = ws.map(w => agoOf(w.date))
    span = Math.max(...agos) - Math.min(...agos)
  }

  const enough = weighIns >= MIN_WEIGH_INS && span >= MIN_SPAN_DAYS && coverage >= MIN_COVERAGE && avgIntake !== null
  if (!enough) return { ok: false }

  // x increases with recency (most recent edge = endAgo), so slope>0 = gaining.
  const fit = linearFit(ws.map(w => ({ x: endAgo - agoOf(w.date), y: w.lb })))
  if (!fit) return { ok: false }

  const slopeLbDay = fit.slope
  return {
    ok: true,
    avgIntake,
    coverage,
    rateLbPerWk: slopeLbDay * 7,
    maintMid: avgIntake - slopeLbDay * CAL_PER_LB,
    maintErr: Math.abs(fit.slopeSE * CAL_PER_LB),
    recentLb: fit.intercept + fit.slope * endAgo,
  }
}

const round25 = (n) => Math.round(n / 25) * 25

export function energyBalanceRead({ calorieSeries = [], weightSeries = [], calorieTarget, windowDays = WINDOW_DAYS }) {
  const target = Number(calorieTarget) || 0
  if (!target) return { hasTarget: false, hasData: false }

  const today = new Date(); today.setHours(12, 0, 0, 0)
  const dailyWeights = dailyWeightsLb(weightSeries)

  const cur = readWindow({ calorieSeries, dailyWeights, today, startAgo: 0, endAgo: windowDays })
  if (!cur.ok) return { hasTarget: true, hasData: false }

  const err = Math.max(cur.maintErr, MIN_BAND_CAL)
  const maintenance = { low: round25(cur.maintMid - err), mid: round25(cur.maintMid), high: round25(cur.maintMid + err) }
  const settling = err > WIDE_BAND_CAL

  // Plausibility off the trend-fitted recent weight (not a single noisy point).
  const wLb = cur.recentLb
  let flag = null
  if (cur.maintMid < wLb * 11) flag = 'low'
  else if (cur.maintMid > wLb * 19) flag = 'high'
  const plausibility = { flag, typicalLow: round25(wLb * 13), typicalHigh: round25(wLb * 16) }

  const prev = readWindow({ calorieSeries, dailyWeights, today, startAgo: windowDays, endAgo: windowDays * 2 })
  const trajectory = prev.ok
    ? { prevMaintenance: round25(prev.maintMid), prevRateLbPerWk: prev.rateLbPerWk }
    : null

  return {
    hasTarget: true,
    hasData: true,
    windowDays,
    target,
    avgIntake: cur.avgIntake,
    loggedVsTarget: cur.avgIntake - target,
    rateLbPerWk: cur.rateLbPerWk,
    maintenance,
    settling,
    plausibility,
    trajectory,
  }
}
