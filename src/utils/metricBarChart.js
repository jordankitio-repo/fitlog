// Builds a chart.js bar dataset for a "more is better" metric (cardio, steps):
// each day's bar is colored by how it did against target — green at/over
// target, amber partial, red well under — with a dashed target line. Unlike
// calories there's no "over" penalty (exceeding the target is just green).
// When no target is set, bars fall back to the metric's own color.

const GREEN = (a) => `rgba(52, 211, 153, ${a})`
const AMBER = (a) => `rgba(251, 191, 36, ${a})`
const RED = (a) => `rgba(248, 113, 113, ${a})`

// Same 90 / 60 thresholds the rest of the app uses for "on target" — minus the
// upper bound, since here exceeding the target is good.
function color(pct, a) {
  return pct >= 90 ? GREEN(a) : pct >= 60 ? AMBER(a) : RED(a)
}

export function metricBarData({ history, valueKey, dateKey = 'date', label, target, fallback, plain = false }) {
  // plain = revert to the flat metric color (no target coloring, no target line).
  const barColor = (value, a) => (target && !plain ? color((value / target) * 100, a) : fallback(a))
  const datasets = [{
    label,
    data: history.map((d) => d[valueKey]),
    backgroundColor: history.map((d) => barColor(d[valueKey], 0.7)),
    borderColor: history.map((d) => barColor(d[valueKey], 1)),
    borderWidth: 1,
    borderRadius: 4,
  }]
  if (target && !plain) {
    datasets.push({
      type: 'line',
      label: 'Target',
      data: history.map(() => target),
      borderColor: 'rgba(255, 255, 255, 0.3)',
      borderDash: [4, 4],
      borderWidth: 1,
      pointRadius: 0,
      fill: false,
      tension: 0,
    })
  }
  return { labels: history.map((d) => d[dateKey]), datasets }
}
