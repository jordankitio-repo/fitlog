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
  // (the old pure-white vanished on a white background).
  targetLine: 'rgba(128, 128, 128, 0.5)',
}
