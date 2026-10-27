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
// Sentence case, not the uppercase this used to carry, and ALLOWED TO WRAP.
//
// Uppercase with 0.08em tracking makes "AVG OF TARGET" about 95px wide, and
// `.ds-statcell` forces nowrap to keep a strip's numerals on one baseline. Put
// five of those in the ~380px column this sits in between roughly 1000px and
// 1300px of viewport and the labels do not truncate — they overrun their cells
// and print on top of each other: "AYS LOGG" "VG OF TARGE" "N-TARGET".
//
// Dropping the case and the tracking buys about 25% of the width back, and
// letting the label take a second line buys the rest. The baseline the nowrap
// was protecting is held by a two-line box instead, so every value in the strip
// still starts at the same height whether its label wrapped or not.
const LABEL_LINES = 2
const labelStyle = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-faint)',
  fontWeight: 'var(--weight-medium)',
  margin: 0,
  whiteSpace: 'normal',
  lineHeight: 1.25,
  minHeight: `${LABEL_LINES * 1.25}em`,
}

// `bare`: no border of its own, for a strip that sits inside another read
// (the coach's Adherence, where the average of target is the rings' job and
// a bordered box inside the card was a panel inside a panel).
export default function ComplianceSummary({ logsByDate, calorieTarget, variant = 'solo', windowDays = 90, bare = false }) {
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
    ...(s.hasTarget && !bare ? [{ num: `${s.avgOfTarget}%`, label: 'Avg of target', color: null }] : []),
    // The GRADE stays on the numeral (B1) — the compliance scale's own tokens,
    // validated for both themes in complianceScale.js, not the metric fill
    // tokens the doc bars from text.
    ...(s.hasTarget ? [
      // No hyphen: at the narrowest cell the label takes two lines, and
      // "On-target" breaks after the hyphen and leaves it hanging.
      { num: s.onTarget, label: 'On target', color: COMPLIANCE.onTarget },
      { num: s.over, label: 'Over', color: COMPLIANCE.over },
      { num: s.partial + s.under, label: 'Under', color: COMPLIANCE.wellUnder },
    ] : []),
  ]

  return (
    /* The strip is a bordered card rather than a bare row, so five numbers
       floating in the middle of a section read as one object. */
    <div className={`cs-strip${bare ? ' is-bare' : ''}`} style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
      // Centred, and full height, because this sits beside the weekday panel
      // as a matched pair. One row of five cells is shorter than that panel
      // will ever be, so the slack goes above and below the numbers rather
      // than all of it underneath them.
      alignItems: 'center',
      justifyItems: 'stretch',
      height: '100%',
      ...(bare ? {} : {
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        padding: 'var(--space-16) var(--space-12)',
      }),
    }}>
      {cells.map(c => (
        <span key={c.label} className="ds-statcell" style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center', alignItems: 'center' }}>
          <span style={labelStyle}>{c.label}</span>
          {/* A zero takes no grade colour: "On target 0" in green read as good
              news, and a red 0 under Under as bad news about nothing. */}
          <span className="tnum" style={{ ...numStyle, color: c.num === 0 ? 'var(--color-muted)' : (c.color || 'var(--color-text)') }}>{c.num}</span>
        </span>
      ))}
    </div>
  )
}
