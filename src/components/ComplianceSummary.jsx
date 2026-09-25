import { summarizeCompliance } from '../utils/complianceSummary'
import { COMPLIANCE } from '../utils/complianceScale'

// Quantified totals that pair with the 90-day ComplianceHeatmap: the grid shows
// the shape, these show the magnitude. Descriptive only.
//
// variant === 'coach' → compliance/assessment lens (on-target / over / under /
//   avg of target) — the adherence read a coach evaluates. On-target is a band
//   (90-110%); over-eating is its own bucket, never counted as on-target.
// variant === 'solo'  → consistency/mirror lens (days logged + on-track days) —
//   self-motivation, never a performance verdict. Keeps the coach/solo wall.
// C1's StatCell strip: "several facts about one subject — mono uppercase label
// over a tabular value, hairline divider between cells." That is exactly what
// this is, and it used to be a grid of filled tiles instead.
//
// The fill was the real bug. It was `--color-bg`, which is the PAGE colour
// (#0a0a0a dark, #f4f5f4 light) — deeper than the `--color-surface` card these
// sit inside, in BOTH themes. So every tile was a surface drawn RECESSED into
// its own panel, which inverts D0's page < panel < control ramp, and it added a
// second surface (A1) to say "these belong together" where a hairline says it
// for free. Space and a rule, no box.
const cellStyle = {
  padding: 'var(--space-12) var(--space-16)',
  borderTop: '1px solid var(--color-border)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  justifyContent: 'center',
  minWidth: 0,
}

// A5's data-numeral row: --text-lg, semibold. It was --weight-bold (700), which
// the ramp reserves for display numerals — a 20px summary figure is not one.
const numStyle = {
  fontWeight: 'var(--weight-semibold)',
  fontSize: 'var(--text-lg)',
  margin: 0,
  lineHeight: 1.1,
}
const labelStyle = {
  fontSize: 'var(--text-xs)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-faint)',
  fontWeight: 'var(--weight-medium)',
  margin: 0,
}

export default function ComplianceSummary({ logsByDate, calorieTarget, variant = 'solo' }) {
  const s = summarizeCompliance(logsByDate, calorieTarget)
  if (s.logged === 0) return null

  // `wide` tiles span both grid columns. Coach: a full-width "days logged" header
  // over a 2x2 of the compliance buckets. Solo: two stacked full-width tiles.
  const tiles = variant === 'coach'
    ? [
        { num: `${s.logged}/${s.elapsed}`, label: 'Days logged', color: 'var(--color-text)', wide: true },
        ...(s.hasTarget ? [
          { num: s.onTarget, label: 'On-target', color: COMPLIANCE.onTarget },
          { num: s.over, label: 'Over', color: COMPLIANCE.over },
          { num: s.partial + s.under, label: 'Under', color: COMPLIANCE.wellUnder },
          { num: `${s.avgOfTarget}%`, label: 'Avg of target', color: 'var(--color-text)' },
        ] : []),
      ]
    : [
        { num: `${s.logged}/${s.elapsed}`, label: `Days logged (${s.coverage}%)`, color: COMPLIANCE.onTarget, wide: true },
        ...(s.hasTarget ? [
          { num: s.onTarget, label: 'On-track days', color: COMPLIANCE.onTarget, wide: true },
        ] : []),
      ]

  return (
    // column-gap only: a row gap would open a space the hairline is already
    // closing, and the two together read as neither a list nor a grid.
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 'var(--space-16)', height: '100%' }}>
      {tiles.map(t => (
        <div key={t.label} style={{ ...cellStyle, gridColumn: t.wide ? '1 / -1' : 'auto' }}>
          <p style={labelStyle}>{t.label}</p>
          {/* The GRADE stays on the numeral (B1) — these are the compliance
              scale's own tokens, validated for both themes in complianceScale.js,
              not the metric fill tokens the doc bars from text. */}
          <p className="tnum" style={{ ...numStyle, color: t.color }}>{t.num}</p>
        </div>
      ))}
    </div>
  )
}
