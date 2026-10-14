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

export default function ComplianceSummary({ logsByDate, calorieTarget, variant = 'solo' }) {
  const s = summarizeCompliance(logsByDate, calorieTarget)
  if (s.logged === 0) return null

  // Two kinds of fact, and the 2x2 was mixing them.
  //
  // On-target, Over and Under are three COUNTS OF DAYS, and they sum to the
  // days logged — 27 + 19 + 1 = 47. Avg of target is a percentage. Putting the
  // percentage in a fourth cell made a tidy square out of three homogeneous
  // facts and one unrelated one, which is why no amount of restyling made the
  // block read as organised: the grouping itself was wrong.
  //
  // So the two SUMMARY figures frame the block, and the three counts below are
  // a strip of the same kind of thing — the C1 pattern for exactly this,
  // "several facts about one subject", with a hairline between cells.
  const counts = s.hasTarget
    ? [
        { num: s.onTarget, label: 'On-target', color: COMPLIANCE.onTarget },
        { num: s.over, label: 'Over', color: COMPLIANCE.over },
        { num: s.partial + s.under, label: 'Under', color: COMPLIANCE.wellUnder },
      ]
    : []

  // A5: size and colour carry the hierarchy, so the figure leads at --text-md
  // against an --text-xs label and needs no second weight to be read first.
  const headline = (figure, label, color) => (
    <p style={{
      display: 'flex', alignItems: 'baseline', gap: 'var(--space-8)',
      margin: 0, fontSize: 'var(--text-xs)', letterSpacing: '0.08em',
      textTransform: 'uppercase', color: 'var(--color-faint)',
      fontWeight: 'var(--weight-medium)', whiteSpace: 'nowrap',
    }}>
      <span className="tnum" style={{
        fontSize: 'var(--text-md)', letterSpacing: 'normal',
        fontWeight: 'var(--weight-semibold)', color: color || 'var(--color-text)',
      }}>{figure}</span>
      {label}
    </p>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-8) var(--space-20)' }}>
        {headline(`${s.logged}/${s.elapsed}`, 'days logged', variant === 'coach' ? null : COMPLIANCE.onTarget)}
        {s.hasTarget && headline(`${s.avgOfTarget}%`, 'avg of target')}
      </div>

      {counts.length > 0 && (
        /* One rule above the strip and a hairline between its cells — the
           .ds-statcell shape the roster already uses. The old grid drew a
           border on top of every cell, so the column gap cut each rule in half
           and the block read as a stack of broken lines. */
        <div style={{
          display: 'flex', alignItems: 'flex-start',
          borderTop: '1px solid var(--color-border)',
          paddingTop: 'var(--space-12)',
        }}>
          {counts.map(t => (
            <span key={t.label} className="ds-statcell" style={{ flex: '1 1 0', minWidth: 0 }}>
              <span style={labelStyle}>{t.label}</span>
              {/* The GRADE stays on the numeral (B1) — the compliance scale's
                  own tokens, validated for both themes in complianceScale.js,
                  not the metric fill tokens the doc bars from text. */}
              <span className="tnum" style={{ ...numStyle, color: t.color }}>{t.num}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
