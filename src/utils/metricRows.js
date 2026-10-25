// The words on the Body and activity card's rows (Log). Pure so the phrasing
// is tested rather than eyeballed. Every helper here reads a day against its
// own GOAL; nothing compares with an earlier day. The Log is for logging and
// for "how is today going", and trends over time are My Progress's job.

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

// "323% of 35 min" against the daily cardio target, else null. The cardio
// counterpart of stepsGoalSub: an effort that resets each day is read against
// its goal, never against yesterday (a rest day would read as a decline).
export function cardioGoalSub(minutes, target) {
  const t = Number(target)
  if (!Number.isFinite(t) || t <= 0) return null
  return `${Math.round((Number(minutes) / t) * 100)}% of ${formatMinutes(t)}`
}

// A tape measurement typed into the form, converted when its unit toggles
// (in <-> cm) so the number follows the unit instead of being relabelled:
// "30" in becomes "76.2" cm. One decimal, the way the form stores them.
// Blank or half-typed input is returned as it is.
export function convertLengthValue(value, from, to) {
  if (from === to) return value
  const n = Number(value)
  if (value === '' || value == null || !Number.isFinite(n)) return value
  const cm = from === 'in' ? n * 2.54 : n
  const out = to === 'in' ? cm / 2.54 : cm
  return String(Math.round(out * 10) / 10)
}
