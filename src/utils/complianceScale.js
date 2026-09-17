// The compliance color scale, declared ONCE for the whole app.
//
// Every surface that grades a day against target — the heatmap cells, the
// heatmap legend, the summary tiles — reads these.
//
// THREE buckets, not four, and that is a finding rather than a preference.
// The scale used to run on the UI status tokens: success / over / warning /
// error. Validated with the dataviz skill's checker (all-pairs, OKLab ΔE,
// deutan + protan simulated at severity 1.0) those four FAIL in both themes,
// worst of all in light where `over` #c2410c and `under` #b45309 land ΔE 0.1
// apart under deuteranopia and 4.1 apart under normal vision — the two middle
// swatches in the legend were, measurably, the same colour.
//
// It is not a tuning problem. 4,032 combinations across the red / amber /
// green / orange ramps were checked against the dark surface and NONE passes:
// four warm statuses cannot be made mutually separable inside the mark
// lightness band. The skill's own instruction for that case is to fold a
// bucket rather than keep hunting hues.
//
// So the heatmap answers "how consistent was this client" — on target, off it,
// or barely eating — and the DIRECTION of a miss (over vs under) stays in the
// ComplianceSummary tiles right beside it, where it is a labelled number and
// needs no colour to carry it.
export const COMPLIANCE = {
  onTarget:  'var(--compliance-good)', // 90-110% of target
  offTarget: 'var(--compliance-off)',  // 60-89% or >110% — missed, either way
  wellUnder: 'var(--compliance-low)',  // <60%
  noLog:     'var(--color-border)',
}
