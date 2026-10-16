// W / M / Y for the Trends charts — the range control Apple's metric detail
// pages carry, minus the D.
//
// **There is no D, and that is a data fact rather than a design preference.**
// Apple can draw "today, by hour" because the phone counts continuously.
// Gardnr stores `steps_log` and `weight_log` as ONE row per logged_date — a
// daily total and a single weigh-in — so for the two metrics where an intraday
// chart is most meaningful there is simply no series to plot. Calories and
// cardio do have several rows a day, but their only timestamp is `created_at`,
// which is when the entry was TYPED IN, not when the food was eaten or the run
// was run. A "today" chart built on that is a picture of logging behaviour
// wearing the label of a metric, which is worse than not offering the range.
// If per-entry event times are ever captured, D becomes real and belongs here.

export const RANGES = [
  { key: 'W', label: 'W', days: 7, name: 'Last 7 days' },
  { key: 'M', label: 'M', days: 30, name: 'Last 30 days' },
  { key: 'Y', label: 'Y', days: 365, name: 'Last 12 months' },
]

export const DEFAULT_RANGE = 'M'

export function rangeByKey(key) {
  return RANGES.find((r) => r.key === key) || RANGES.find((r) => r.key === DEFAULT_RANGE)
}

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Bucket a sparse daily history into the points one range should plot.
//
// W and M plot the logged days themselves. Y plots one point per MONTH, and
// that point is the average of the days logged in it — never the sum.
//
// Summing would make a month read as a win purely for having more entries in
// it: log twelve days in March and thirty in April and April's bar is more than
// twice as tall at identical behaviour. The whole panel is already built on
// "averaged over the days you logged" (the Trends rows say so in their own
// sub-line), so the year view uses the same rule rather than a second one, and
// the daily target line stays meaningful against it — a monthly average of
// daily values is comparable to a daily target; a monthly total is not.
export function bucketHistory(history, valueKey, rangeKey, { asOf = new Date() } = {}) {
  const range = rangeByKey(rangeKey)
  const end = new Date(asOf)
  end.setHours(12, 0, 0, 0)

  const rows = (history || []).filter((r) => r && r.iso)
  const from = new Date(end.getTime() - (range.days - 1) * 86400000)
  const within = rows
    .filter((r) => r.iso >= ymd(from) && r.iso <= ymd(end))
    .sort((a, b) => a.iso.localeCompare(b.iso))

  if (range.key !== 'Y') {
    return within.map((r) => ({ ...r, date: r.iso.slice(5) }))
  }

  // One point per calendar month, in order, labelled by month name. The year is
  // appended only at a January boundary, so a 12-month window that crosses one
  // does not render two unexplained "Jan" columns.
  const byMonth = new Map()
  for (const r of within) {
    const key = r.iso.slice(0, 7) // YYYY-MM
    if (!byMonth.has(key)) byMonth.set(key, [])
    byMonth.get(key).push(Number(r[valueKey]) || 0)
  }
  const keys = [...byMonth.keys()].sort()
  return keys.map((key, i) => {
    const vals = byMonth.get(key)
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const [y, m] = key.split('-')
    const month = MONTHS[Number(m) - 1]
    const prevYear = i > 0 ? keys[i - 1].slice(0, 4) : null
    return {
      iso: `${key}-01`,
      date: prevYear && prevYear !== y ? `${month} ${y.slice(2)}` : month,
      // Rounded because these are plotted and read, not summed further. Weight
      // keeps a decimal; everything else is a whole unit.
      [valueKey]: valueKey === 'weight' ? Math.round(mean * 10) / 10 : Math.round(mean),
      days: vals.length,
    }
  })
}
