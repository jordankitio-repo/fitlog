export function toLocalDateString(date) {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getCurrentWeekSunday() {
  const now = new Date()
  const day = now.getDay()
  const sunday = new Date(now)
  sunday.setDate(now.getDate() - day)
  return `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`
}

// --- Check-in cadence ----------------------------------------------------
// Check-ins are keyed by a period-start Sunday (check_ins.week_of). With a
// configurable cadence (interval in weeks), the "current period" generalizes
// the "current week". Periods are anchored to a fixed epoch Sunday so all
// clients of a given interval share deterministic boundaries — no per-client
// anchor needed. interval = 1 returns the current calendar-week Sunday, i.e.
// identical to getCurrentWeekSunday(), so existing weekly data is unaffected.
const EPOCH_SUNDAY_UTC = Date.UTC(1970, 0, 4) // 1970-01-04 was a Sunday
const WEEK_MS = 7 * 86400000

// The Date (local, noon) starting the current check-in period for `interval`.
export function checkinPeriodStart(intervalWeeks = 1, date = new Date()) {
  const n = Math.max(1, Math.floor(intervalWeeks) || 1)
  const sunday = getCurrentWeekStart(date)
  const sundayUTC = Date.UTC(sunday.getFullYear(), sunday.getMonth(), sunday.getDate())
  const weeksSinceEpoch = Math.round((sundayUTC - EPOCH_SUNDAY_UTC) / WEEK_MS)
  const bucketStartWeek = Math.floor(weeksSinceEpoch / n) * n
  return addDays(sunday, (bucketStartWeek - weeksSinceEpoch) * 7)
}

// Full description of the current check-in period for `interval`:
//   weekOf    — the period-start date string (the check_ins key)
//   start/end — Date objects bounding the period
//   daysIn    — days elapsed since the period start (0-based)
//   dueWindow — true in the last 3 days (Thu/Fri/Sat of the final week): the
//               "naggable" window, generalizing the weekly getDay() >= 4 rule.
export function checkinPeriod(intervalWeeks = 1, date = new Date()) {
  const n = Math.max(1, Math.floor(intervalWeeks) || 1)
  const start = checkinPeriodStart(n, date)
  const end = addDays(start, n * 7 - 1)
  const todayNoon = new Date(date); todayNoon.setHours(12, 0, 0, 0)
  const daysIn = Math.floor((todayNoon - start) / 86400000)
  return { intervalWeeks: n, start, end, weekOf: toLocalDateString(start), daysIn, dueWindow: daysIn >= n * 7 - 3 }
}

export function parseLocalDateString(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

export function addDays(date, days) {
  const d = new Date(date)
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d
}

export function getCurrentWeekStart(date = new Date()) {
  const d = new Date(date)
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

export function getWeeklyReportRange(date = new Date()) {
  const currentWeekStart = getCurrentWeekStart(date)
  const start = addDays(currentWeekStart, -7)
  const end = addDays(currentWeekStart, -1)

  return {
    start,
    end,
    startDate: toLocalDateString(start),
    endDate: toLocalDateString(end),
    label: formatDateRange(start, end)
  }
}

export function getDatesInRange(start, end) {
  const dates = []
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    dates.push(toLocalDateString(d))
  }
  return dates
}

export function formatDateRange(start, end) {
  const sameYear = start.getFullYear() === end.getFullYear()
  const sameMonth = sameYear && start.getMonth() === end.getMonth()
  const monthDay = { month: 'long', day: 'numeric' }

  if (sameMonth) {
    return `${start.toLocaleDateString('en-US', monthDay)} - ${end.toLocaleDateString('en-US', { ...monthDay, year: 'numeric' })}`
  }

  if (sameYear) {
    return `${start.toLocaleDateString('en-US', monthDay)} - ${end.toLocaleDateString('en-US', { ...monthDay, year: 'numeric' })}`
  }

  return `${start.toLocaleDateString('en-US', { ...monthDay, year: 'numeric' })} - ${end.toLocaleDateString('en-US', { ...monthDay, year: 'numeric' })}`
}
