// Chart.js renders to a <canvas> and can't read CSS variables, so chart chrome
// (ticks, gridlines, tooltip) uses theme-agnostic literals instead of the
// themeable tokens: a mid grey + translucent gridlines read fine on both the
// dark and light card backgrounds, and the tooltip stays dark (common and
// legible even in light themes).
export const CHART = {
  tick: '#888',
  grid: 'rgba(128, 128, 128, 0.18)',
  tooltipBg: '#1a1a1a',
  tooltipBorder: 'rgba(128, 128, 128, 0.25)',
  tooltipTitle: '#f0f0f0',
  tooltipBody: '#bbbbbb',
  // Dashed target/reference line — mid grey reads on both dark and light cards
  // (the old pure-white vanished on a white background). Dashing is legitimate
  // HERE and only here: this is a threshold, which is the one thing a dashed
  // rule is allowed to mean. Gridlines are never dashed.
  targetLine: 'rgba(128, 128, 128, 0.5)',
}

// ── Mark specs ───────────────────────────────────────────────────────────────
// Fixed across every chart in the app so the data is the only loud thing.
// Lines 2px with round joins; bars capped thin with a rounded data-end and NO
// stroke (a border round a mark adds ink that isn't data — the gap between bars
// is what separates them); area fills are a ~10% wash, never a saturated block.
export const MARK = {
  lineWidth: 2,
  pointRadius: 0,
  endPointRadius: 4,
  barThickness: 12,
  barRadius: 4,
  areaAlpha: 0.10,
}

// Shared axis/plugin chrome. `singleSeries` hides the legend box: with one
// series there is one colour, and the card title already names it — a box with
// one swatch restates the title and costs space.
//
// VERTICAL GRIDLINES ARE OFF. On a time axis they fence every day into a cell
// and read as a table; the horizontal rules are what let you compare heights.
export function baseChartOptions({ singleSeries = false } = {}) {
  return {
    responsive: true,
    animation: false,
    plugins: {
      legend: {
        display: !singleSeries,
        labels: { color: CHART.tick, boxWidth: 12, padding: 12, font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' },
      },
      tooltip: {
        backgroundColor: CHART.tooltipBg,
        borderColor: CHART.tooltipBorder,
        borderWidth: 1,
        titleColor: CHART.tooltipTitle,
        bodyColor: CHART.tooltipBody,
        padding: 10,
        cornerRadius: 6,
        displayColors: false,
      },
    },
    scales: {
      x: { ticks: { color: CHART.tick }, grid: { display: false }, border: { color: CHART.grid } },
      y: {
        ticks: { color: CHART.tick, maxTicksLimit: 5 },
        grid: { color: CHART.grid, drawTicks: false },
        border: { display: false },
      },
    },
  }
}
