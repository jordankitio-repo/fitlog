import { summarizeCompliance } from '../utils/complianceSummary'
import { COMPLIANCE } from '../utils/complianceScale'

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

export default function ComplianceSummary({ logsByDate, calorieTarget, variant = 'solo', windowDays = 90 }) {
  const s = summarizeCompliance(logsByDate, calorieTarget, windowDays)
  if (s.logged === 0) return null

  // ONE strip, one cell shape.
  //
  // This block used to be two blocks: the two summary figures as `value label`
  // inline and left-aligned, then a rule, then the three counts as
  // label-above-value in cells that spread. Two different cell shapes and two
  // different alignments inside one bordered card, which is what made it read
  // as disorganised however the spacing was tuned — the eye was being asked to
  // learn two layouts to read five numbers.
  //
  // They are five facts about one subject, which is exactly what `.ds-statcell`
  // is for (the roster's strip, the same hairline between cells). The earlier
  // note here argued the percentage "does not belong beside" the counts; that
  // reasoning was about a 2x2 GRID WITH A HOLE, and it is the hole that was the
  // problem. In a row of equal cells, each label says what its own number is
  // and nothing is stranded.
  const cells = [
    { num: `${s.logged}/${s.elapsed}`, label: 'Days logged', color: variant === 'coach' ? null : COMPLIANCE.onTarget },
    ...(s.hasTarget ? [{ num: `${s.avgOfTarget}%`, label: 'Avg of target', color: null }] : []),
    // The GRADE stays on the numeral (B1) — the compliance scale's own tokens,
    // validated for both themes in complianceScale.js, not the metric fill
    // tokens the doc bars from text.
    ...(s.hasTarget ? [
      { num: s.onTarget, label: 'On-target', color: COMPLIANCE.onTarget },
      { num: s.over, label: 'Over', color: COMPLIANCE.over },
      { num: s.partial + s.under, label: 'Under', color: COMPLIANCE.wellUnder },
    ] : []),
  ]

  return (
    /* The strip is a bordered card rather than a bare row, so five numbers
       floating in the middle of a section read as one object. */
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: 'var(--space-16) var(--space-12)',
    }}>
      {cells.map(c => (
        <span key={c.label} className="ds-statcell" style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center', alignItems: 'center' }}>
          <span style={labelStyle}>{c.label}</span>
          <span className="tnum" style={{ ...numStyle, color: c.color || 'var(--color-text)' }}>{c.num}</span>
        </span>
      ))}
    </div>
  )
}
