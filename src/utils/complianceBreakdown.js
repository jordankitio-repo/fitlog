import { toLocalDateString } from './dateHelpers'

// Weekday-vs-weekend ADHERENCE breakdown for a client — the "why is this one
// slipping" panel on the coach's client view.
//
// This is deliberately NOT a percentage engine. Per Ai-context/decisions.md
// ("No fabricated-confidence numbers"), a rate computed over a handful of
// weekend days is spurious precision. So this returns COUNTS (3 of 6 days) and
// the MAGNITUDE of the miss (avg +780 cal over target) — concrete facts a coach
// can verify — and refuses to name a weaker segment until each side has enough
// logged days to be worth comparing.
//
// It also stays DESCRIPTIVE: it reports where adherence dips, not what "caused"
// it. Lower weekend adherence is a correlation, not a proven driver.
//
// `logsByDate`: { 'YYYY-MM-DD': { calories: Number } }  (same shape as the
//   heatmap / ComplianceSummary input).
// `calorieTarget`: the client's daily calorie target.

// A day counts as "on target" within +/- this fraction of the target.
const ON_TARGET_BAND = 0.1
// Minimum logged days in EACH segment before we'll name a weaker one.
const MIN_DAYS_PER_SEGMENT = 3

function blankSegment() {
  return { logged: 0, onTarget: 0, over: 0, under: 0, _overSum: 0 }
}

export function complianceBreakdown(logsByDate, calorieTarget, windowDays = 90) {
  const target = Number(calorieTarget) || 0
  if (!target) {
    return { hasTarget: false, insufficient: true, weaker: null, weekday: blankSegment(), weekend: blankSegment() }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const weekday = blankSegment()
  const weekend = blankSegment()

  for (let i = 0; i < windowDays; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const log = logsByDate[toLocalDateString(d)]
    if (!log) continue

    const dow = d.getDay()
    const seg = dow === 0 || dow === 6 ? weekend : weekday
    seg.logged++

    const cal = log.calories || 0
    const ratio = cal / target
    if (ratio > 1 + ON_TARGET_BAND) {
      seg.over++
      seg._overSum += cal - target
    } else if (ratio < 1 - ON_TARGET_BAND) {
      seg.under++
    } else {
      seg.onTarget++
    }
  }

  const finish = (seg) => ({
    logged: seg.logged,
    onTarget: seg.onTarget,
    over: seg.over,
    under: seg.under,
    // Average calories over target, across the days that ran over. Null when none.
    avgOverDelta: seg.over > 0 ? Math.round(seg._overSum / seg.over) : null,
  })

  const wkday = finish(weekday)
  const wkend = finish(weekend)

  // Only name a weaker segment when both sides have enough days to compare AND
  // their on-target *counts relative to logged days* actually differ.
  const enough = wkday.logged >= MIN_DAYS_PER_SEGMENT && wkend.logged >= MIN_DAYS_PER_SEGMENT
  let weaker = null
  if (enough) {
    const wkdayRate = wkday.onTarget / wkday.logged
    const wkendRate = wkend.onTarget / wkend.logged
    if (wkendRate < wkdayRate) weaker = 'weekend'
    else if (wkdayRate < wkendRate) weaker = 'weekday'
  }

  return {
    hasTarget: true,
    insufficient: !enough,
    weaker,
    weekday: wkday,
    weekend: wkend,
  }
}
