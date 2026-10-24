// The words on the Body and activity card's rows (Log). Pure so the phrasing
// is tested rather than eyeballed, and kept apart from the page so a row's
// sub-line can't quietly drift into stating what is missing again -- "No
// distance" was the line this replaced, a fact nobody had asked about.

import { convertWeight, normUnit } from './weightTarget'
import { parseLocalDateString, addDays, toLocalDateString } from './dateHelpers'

// 35 -> "35 min", 78 -> "1 hr 18 min", 120 -> "2 hr". Past an hour, minutes
// alone make the reader do the division.
export function formatMinutes(total) {
  const m = Math.max(0, Math.round(Number(total) || 0))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} hr ${rest} min` : `${h} hr`
}

// "98% of 9,000" when a step target exists, else null (the caller falls back).
export function stepsGoalSub(steps, target) {
  const t = Number(target)
  if (!Number.isFinite(t) || t <= 0) return null
  const pct = Math.round((Number(steps) / t) * 100)
  return `${pct}% of ${t.toLocaleString('en-US')}`
}

// The change since the previous weigh-in, in TODAY's unit: "−0.2 kg vs
// yesterday", "+1.4 lbs vs Oct 20", "No change vs yesterday". Null with no
// earlier weigh-in. A true minus sign, not a hyphen: it is a number.
export function weightDeltaSub(current, previous) {
  if (!current || !previous) return null
  const unit = normUnit(current.unit)
  const prev = convertWeight(Number(previous.weight), normUnit(previous.unit), unit)
  const delta = Math.round((Number(current.weight) - prev) * 10) / 10
  const yesterday = toLocalDateString(addDays(parseLocalDateString(current.logged_date), -1))
  const when = previous.logged_date === yesterday
    ? 'yesterday'
    : parseLocalDateString(previous.logged_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (delta === 0) return `No change vs ${when}`
  const sign = delta > 0 ? '+' : '−'
  return `${sign}${Math.abs(delta).toFixed(1)} ${unit} vs ${when}`
}
