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
