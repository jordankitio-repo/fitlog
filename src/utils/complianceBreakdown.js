import { toLocalDateString } from './dateHelpers'
import { targetFn } from './targetHistory'

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
export const ON_TARGET_BAND = 0.1

// One definition of an on-target CALORIE day for every surface: the heatmap's
// 90-110% band. The roster's grade used "at least 90%", so a client eating
// 140% of target every day was "On track" on the same page whose heatmap
// counted zero days on target. Over is not on target for calories.
export function calorieDayOnTarget(total, target) {
  if (!(total > 0) || !(target > 0)) return false
  const ratio = total / target
  return ratio >= 1 - ON_TARGET_BAND && ratio <= 1 + ON_TARGET_BAND
}
// Minimum logged days in EACH segment before we'll name a weaker one.
const MIN_DAYS_PER_SEGMENT = 3

function blankSegment() {
  return { logged: 0, onTarget: 0, over: 0, under: 0, _overSum: 0, _sum: 0, _cal: 0, _target: 0 }
}

//
// `calorieTarget` is a number or a target lookup (utils/targetHistory): each day
// is graded against the plan in force THAT day. A day with no plan is skipped.
export function complianceBreakdown(logsByDate, calorieTarget, windowDays = 90) {
  const targetOn = targetFn(calorieTarget)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Today's plan names the target on screen; past days are graded on their own.
  const currentTarget = targetOn(toLocalDateString(today))

  const weekday = blankSegment()
  const weekend = blankSegment()
  // Each day of the week on its own (0 = Sunday), for the row of rings.
  const dows = Array.from({ length: 7 }, () => ({ logged: 0, total: 0, targetSum: 0 }))
  let graded = 0

  for (let i = 0; i < windowDays; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const dateStr = toLocalDateString(d)
    const log = logsByDate[dateStr]
    if (!log) continue
    const target = targetOn(dateStr)
    if (!target) continue
    graded++

    const dow = d.getDay()
    const seg = dow === 0 || dow === 6 ? weekend : weekday
    seg.logged++

    const cal = log.calories || 0
    dows[dow].logged++
    dows[dow].total += cal
    dows[dow].targetSum += target
    seg._cal += cal
    seg._target += target
    const ratio = cal / target
    seg._sum += cal - target
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
    // Signed average deviation from target across ALL logged days.
    avgDelta: seg.logged > 0 ? Math.round(seg._sum / seg.logged) : null,
    // The average logged day itself, in calories. Summed directly: "target +
    // the average deviation" only held while the target never changed.
    avgCal: seg.logged > 0 ? Math.round(seg._cal / seg.logged) : null,
    // The average plan across those same days, for the ring's denominator.
    avgTarget: seg.logged > 0 ? seg._target / seg.logged : null,
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

  if (!graded && !currentTarget) {
    return { hasTarget: false, insufficient: true, weaker: null, weekday: blankSegment(), weekend: blankSegment() }
  }

  return {
    hasTarget: true,
    currentTarget,
    insufficient: !enough,
    weaker,
    weekday: wkday,
    weekend: wkend,
    // [{ logged, avgCal, avgTarget }] for Sunday..Saturday; nulls on a day never logged.
    byDow: dows.map(x => ({ logged: x.logged, avgCal: x.logged ? Math.round(x.total / x.logged) : null, avgTarget: x.logged ? x.targetSum / x.logged : null })),
  }
}

