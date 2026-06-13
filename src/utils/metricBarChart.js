// Builds a chart.js bar dataset for a "more is better" metric (cardio, steps):
// each day's bar is colored by how it did against target — green at/over
// target, amber partial, red well under — with a dashed target line. Unlike
// calories there's no "over" penalty (exceeding the target is just green).
// When no target is set, bars fall back to the metric's own color.

const GREEN = (a) => `rgba(52, 211, 153, ${a})`
const AMBER = (a) => `rgba(251, 191, 36, ${a})`
const RED = (a) => `rgba(248, 113, 113, ${a})`
const ORANGE = (a) => `rgba(251, 146, 60, ${a})`

// Same 90 / 60 thresholds the rest of the app uses for "on target". For
// one-directional metrics (cardio, steps) more is better, so there's no upper
// bound. For bidirectional ones (calories) going over the target is a deviation
// (orange), matching the calorie compliance band elsewhere.
function color(pct, a, bidirectional) {
  if (bidirectional && pct > 110) return ORANGE(a)
  return pct >= 90 ? GREEN(a) : pct >= 60 ? AMBER(a) : RED(a)
}

export function metricBarData({ history, valueKey, dateKey = 'date', label, target, fallback, plain = false, bidirectional = false }) {
  // plain = revert to the flat metric color (no target coloring, no target line).
  const barColor = (value, a) => (target && !plain ? color((value / target) * 100, a, bidirectional) : fallback(a))
  const datasets = [{
    label,
    data: history.map((d) => d[valueKey]),
    backgroundColor: history.map((d) => barColor(d[valueKey], 0.7)),
    borderColor: history.map((d) => barColor(d[valueKey], 1)),
    borderWidth: 1,
    borderRadius: 4,
    // Cap width so a chart with fewer logged days (e.g. cardio) doesn't balloon
    // into fat bars — keeps all the metric charts visually consistent.
    maxBarThickness: 12,
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
