import { toLocalDateString, parseLocalDateString } from './dateHelpers'

const MS_PER_DAY = 86400000

// Summarize the last `windowDays` of nutrition logs for the consistency card.
// Purely descriptive: counts logged days and their calorie-compliance buckets,
// using the same thresholds as ComplianceHeatmap (>=90% / 60-89% / <60%).
//
// The denominator (`elapsed`) ramps from the user's first log and caps at the
// window — so a 12-day-old account that logged everything reads "12/12", not a
// demoralizing "12/90". Once history exceeds the window it rolls at the cap.
export function summarizeCompliance(logsByDate, calorieTarget, windowDays = 90) {
  const target = Number(calorieTarget) || 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Window = the last `windowDays` calendar days, ending today (inclusive).
  const windowStart = new Date(today)
  windowStart.setDate(today.getDate() - (windowDays - 1))
  windowStart.setHours(0, 0, 0, 0)

  let logged = 0
  let onTarget = 0
  let over = 0
  let partial = 0
  let under = 0
  let pctSum = 0

  for (let i = 0; i < windowDays; i++) {
    const d = new Date(windowStart)
    d.setDate(windowStart.getDate() + i)
    const log = logsByDate[toLocalDateString(d)]
    if (!log) continue

    logged++
    if (!target) { onTarget++; continue }

    const pct = (log.calories || 0) / target
    pctSum += pct
    // On-target is a BAND (90-110%), not a floor — eating well over target is
    // its own bucket, not "on-target". Keeps the heatmap/summary honest and in
    // step with the weekday/weekend bars (see ComplianceBreakdown).
    if (pct > 1.1) over++
    else if (pct >= 0.9) onTarget++
    else if (pct >= 0.6) partial++
    else under++
  }

  // Earliest logged date (string compare is safe for YYYY-MM-DD).
  let firstLogStr = null
  for (const dateStr of Object.keys(logsByDate)) {
    if (firstLogStr === null || dateStr < firstLogStr) firstLogStr = dateStr
  }

  let elapsed = 0
  if (firstLogStr) {
    const first = parseLocalDateString(firstLogStr)
    first.setHours(0, 0, 0, 0)
    const sinceFirst = Math.round((today - first) / MS_PER_DAY) + 1
    elapsed = Math.min(windowDays, Math.max(1, sinceFirst))
  }

  const coverage = elapsed > 0 ? Math.round((logged / elapsed) * 100) : 0
  const avgOfTarget = target && logged > 0 ? Math.round((pctSum / logged) * 100) : null

  return {
    logged,
    elapsed,
    coverage,
    onTarget,
    over,
    partial,
    under,
    avgOfTarget,
    hasTarget: Boolean(target),
  }
}
