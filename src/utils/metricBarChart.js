// Builds a chart.js bar dataset for a "more is better" metric (cardio, steps):
// each day's bar is colored by how it did against target — green at/over
// target, amber partial, red well under — with a dashed target line. Unlike
// calories there's no "over" penalty (exceeding the target is just green).
// When no target is set, bars fall back to the metric's own color.
import { CHART } from './chartTheme'

// Theme-aware, because these are FILLS on a card whose colour flips. The four
// literals here used to be the dark-mode status values only — measured against
// the light card they come out at 1.87 / 1.62 / 2.69 / 2.20 against a 3:1 floor
// for marks, i.e. the bars washed out in light mode. Same bug as Log's macro
// numerals and the compliance heatmap: a dark-first hue used on a light ground.
// chart.js can't read a CSS variable, so the theme is resolved in JS instead.
import { resolveTheme } from './theme'

const LIGHT = { green: '22,101,52', amber: '180,83,9', red: '153,27,27', orange: '194,65,12' }
const DARK  = { green: '52,211,153', amber: '251,191,36', red: '248,113,113', orange: '251,146,60' }
const ramp = () => (resolveTheme() === 'light' ? LIGHT : DARK)

const GREEN = (a) => `rgba(${ramp().green}, ${a})`
const AMBER = (a) => `rgba(${ramp().amber}, ${a})`
const RED = (a) => `rgba(${ramp().red}, ${a})`
const ORANGE = (a) => `rgba(${ramp().orange}, ${a})`

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
    // Solid fill, NO stroke. A border drawn round a mark is ink that isn't data;
    // the gap between bars is the mechanism that separates them. The old
    // 0.7-alpha fill plus a full-strength 1px outline also read muddy, because
    // every bar was two tones of the same hue.
    backgroundColor: history.map((d) => barColor(d[valueKey], 1)),
    borderWidth: 0,
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
      borderColor: CHART.targetLine,
      borderDash: [4, 4],
      borderWidth: 1,
      pointRadius: 0,
      fill: false,
      tension: 0,
    })
  }
  return { labels: history.map((d) => d[dateKey]), datasets }
}
