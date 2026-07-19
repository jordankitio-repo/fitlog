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

// Selectable analysis windows (days). 21 is the default: the shortest span where
// the weight-slope's regression noise (daily water swings of ±1–2 lb) is small
// next to a real trend, yet still recent enough to reflect the current phase —
// and it matches the typical coaching check-in block. A coach can trade recency
// for confidence (a longer window narrows the band) or the reverse; the band
// width, not the window, is what carries the honesty. 14 (= MIN_SPAN_DAYS) is the
// floor below which a weight line is mostly noise. Max 42 → keep ≥84 days of data
// on hand so the prior-window trajectory still computes.
export const WINDOW_OPTIONS = [14, 21, 28, 42]
export const WINDOW_DATA_DAYS = 90

// Coarse garbage-guards (not the trust gate — the visible band is that):
const MIN_WEIGH_INS = 8      // below this the slope SE itself is unreliable
const MIN_SPAN_DAYS = 14     // weigh-ins must span enough calendar time to fit a line
const MIN_COVERAGE = 0.7     // logged days / window days — bounds under-logging bias
const MIN_BAND_CAL = 50      // floor on the band — a clean fit still isn't ±1 cal
                             // (3500/lb is a heuristic + systematic water error)
const WIDE_BAND_CAL = 200    // band wider than this → soft "still settling" label

// Weigh-ins must span most of the window to fit a line, but a 14-day window can
// only ever span 13 days — so the 14-day floor is capped to what the chosen
// window can physically hold. Longer windows keep the absolute 2-week minimum.
const minSpanFor = (windowDays) => Math.min(MIN_SPAN_DAYS, windowDays - 1)

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

  // Measured inputs travel with every result — even the insufficient one — so the
  // empty state can name WHICH requirement is short instead of a vague catch-all.
  const stats = { weighIns, span, loggedDays, coverage, avgIntake, windowDays }

  const enough = weighIns >= MIN_WEIGH_INS && span >= minSpanFor(windowDays) && coverage >= MIN_COVERAGE && avgIntake !== null
  if (!enough) return { ok: false, ...stats }

  // x increases with recency (most recent edge = endAgo), so slope>0 = gaining.
  // Equal-weight OLS over the window — chosen for interpretability (the coach
  // knows exactly which days are in the line). The state-of-the-art upgrade, if a
  // coach ever needs the extra accuracy, is recency-weighting within the window
  // (exponential decay, à la MacroFactor V3) — see decisions.md (Jul 18).
  const fit = linearFit(ws.map(w => ({ x: endAgo - agoOf(w.date), y: w.lb })))
  if (!fit) return { ok: false, ...stats }

  const slopeLbDay = fit.slope
  return {
    ok: true,
    ...stats,
    rateLbPerWk: slopeLbDay * 7,
    maintMid: avgIntake - slopeLbDay * CAL_PER_LB,
    maintErr: Math.abs(fit.slopeSE * CAL_PER_LB),
    recentLb: fit.intercept + fit.slope * endAgo,
  }
}

// Per-requirement readiness for the empty state, built from a window's measured
// inputs. Each row is a plain fact (have vs need) so the coach sees exactly what
// the read is waiting on — e.g. "weigh-ins are fine, nutrition logging is short".
function readinessFrom(win, windowDays) {
  const loggedNeed = Math.ceil(MIN_COVERAGE * windowDays)
  return {
    windowDays,
    weighIns: { have: win.weighIns || 0, need: MIN_WEIGH_INS, ok: (win.weighIns || 0) >= MIN_WEIGH_INS },
    span: { have: win.span || 0, need: minSpanFor(windowDays), ok: (win.span || 0) >= minSpanFor(windowDays) },
    logging: {
      have: win.loggedDays || 0,
      need: loggedNeed,
      coverage: win.coverage || 0,
      ok: (win.coverage || 0) >= MIN_COVERAGE && win.avgIntake !== null,
    },
  }
}

const round25 = (n) => Math.round(n / 25) * 25

export function energyBalanceRead({ calorieSeries = [], weightSeries = [], calorieTarget, weightGoal, weightGoalUnit = 'lbs', windowDays = WINDOW_DAYS }) {
  const target = Number(calorieTarget) || 0
  if (!target) return { hasTarget: false, hasData: false }

  const today = new Date(); today.setHours(12, 0, 0, 0)
  const dailyWeights = dailyWeightsLb(weightSeries)

  const cur = readWindow({ calorieSeries, dailyWeights, today, startAgo: 0, endAgo: windowDays })
  if (!cur.ok) return { hasTarget: true, hasData: false, windowDays, readiness: readinessFrom(cur, windowDays) }

  const err = Math.max(cur.maintErr, MIN_BAND_CAL)
  const maintenance = { low: round25(cur.maintMid - err), mid: round25(cur.maintMid), high: round25(cur.maintMid + err) }
  const settling = err > WIDE_BAND_CAL

  const prev = readWindow({ calorieSeries, dailyWeights, today, startAgo: windowDays, endAgo: windowDays * 2 })
  const trajectory = prev.ok
    ? { prevMaintenance: round25(prev.maintMid), prevRateLbPerWk: prev.rateLbPerWk }
    : null

  // Goal-aware tone for the weight trend: 'toward' the coach's weight_goal,
  // 'away', or 'neutral' (flat, at goal, or no goal set). NOT a value judgment —
  // it's relative to the prescribed goal, like everything else here.
  const goalLb = Number(weightGoal) ? (weightGoalUnit === 'kg' ? Number(weightGoal) * KG_TO_LB : Number(weightGoal)) : 0
  let rateTone = 'neutral'
  if (goalLb > 0 && Math.abs(cur.rateLbPerWk) >= 0.1 && Math.abs(cur.recentLb - goalLb) > 2) {
    const shouldLose = cur.recentLb > goalLb
    const losing = cur.rateLbPerWk < 0
    rateTone = shouldLose === losing ? 'toward' : 'away'
  }

  return {
    hasTarget: true,
    hasData: true,
    windowDays,
    target,
    avgIntake: cur.avgIntake,
    loggedVsTarget: cur.avgIntake - target,
    coverage: cur.coverage,
    rateLbPerWk: cur.rateLbPerWk,
    rateTone,
    maintenance,
    settling,
    trajectory,
  }
}
