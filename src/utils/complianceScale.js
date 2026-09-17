// The compliance color scale, declared ONCE for the whole app.
//
// Every surface that grades a day against target — the heatmap cells, the
// heatmap legend, the summary tiles — reads these. Buckets match
// summarizeCompliance() in clientStats.js.
//
// These are the scale's OWN tokens, not the UI status tokens, because the two
// solve different problems: a status token has to be legible TYPE on a panel,
// a heatmap cell has to be separable from the cell beside it. Borrowing the UI
// set is what broke light mode — `over` (#c2410c) and `under` (#b45309) landed
// ΔE 4.1 apart under normal vision and 0.1 under deuteranopia, so the two
// middle legend swatches were measurably the same colour.
//
// Light is now validated with the dataviz skill's checker (all-pairs, OKLab ΔE,
// Machado-Oliveira-Fernandes at severity 1.0): all six checks pass, worst pair
// 15.5. Dark is deliberately UNCHANGED — see index.css for the measurement and
// why it was left alone.
export const COMPLIANCE = {
  onTarget:  'var(--compliance-good)', // 90-110% of target
  over:      'var(--compliance-over)', // >110%
  under:     'var(--compliance-under)',// 60-89%
  wellUnder: 'var(--compliance-low)',  // <60%
  noLog:     'var(--color-border)',
}
