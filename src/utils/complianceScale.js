// The compliance color scale, declared ONCE for the whole app.
//
// Every surface that grades a day against target — the heatmap cells, the
// heatmap legend, the summary tiles — reads these. They used to restate the
// same four hex literals at each call site, which is exactly how a scale drifts
// out of sync with itself. Values are design tokens (src/index.css), so they
// flip correctly in light mode; #fb923c/#34d399/#fbbf24/#f87171 as literals did
// not. Buckets match summarizeCompliance() in clientStats.js.
export const COMPLIANCE = {
  onTarget:  'var(--color-success)', // 90-110% of target
  over:      'var(--color-over)',    // >110%
  under:     'var(--color-warning)', // 60-89%
  wellUnder: 'var(--color-error)',   // <60%
  noLog:     'var(--color-border)',
}
