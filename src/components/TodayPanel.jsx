import TargetBar from './TargetBar'

// "Today's stats" and "Today vs target" were the same six facts, twice.
//
// The first panel printed calories, protein, carbs, fat, weight, cardio and
// steps as bare numerals; the second printed the identical six immediately
// below with their denominators and a bar. So the reader met every number
// stripped of the only thing that makes it mean something, then met it again
// with. One panel, each metric once, carrying its target.
//
// The grouping is F2's, the same reading that fixed ClientView: calories,
// protein, carbs and fat are four parts of ONE number and lay out as a block;
// cardio, steps and weight are three independent readings and lay out as a
// strip with dividers. The old seven-cell `repeat(auto-fit, minmax(240px))`
// grid was neither, which is why it stranded Steps on a row of its own with
// `gridColumn: '1 / -1'` — restyling the hole rather than fixing the grouping.
//
// The cell is the page's existing one (ConsistencyStat): label in the metric's
// colour, value, sub. Nothing new invented.

function Cell({ label, color, value, denom, sub, pct, className = '', style }) {
  return (
    <div className={`tp-cell ${className}`.trim()} style={style}>
      <span style={{
        fontSize: 'var(--text-xs)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        // Neutral, not the metric hue: metric tokens are FILL colours and fail
        // WCAG as text on the light card (calories 1.62:1, fat 2.20:1). The
        // hue stays on the bar below, where a shape has no contrast floor.
        color: 'var(--color-muted)',
        fontWeight: 'var(--weight-medium)',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <span className="tnum" style={{
        fontSize: 'var(--text-xl)',
        fontWeight: 'var(--weight-semibold)',
        color: 'var(--color-text)',
        lineHeight: 1.1,
      }}>
        {value}
        {denom && (
          <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 'var(--weight-normal)' }}>
            {denom}
          </span>
        )}
      </span>
      {/* F3: every cell in a column of values carries a value — the unit, the
          target, or the absence ("No target set", "No weight yet"). A blank
          here left a ragged column on the old grid. */}
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', lineHeight: 1.5 }}>
        {sub}
      </span>
      {pct != null && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <TargetBar pct={pct} color={color} />
        </div>
      )}
    </div>
  )
}

export default function TodayPanel({ macros = [], activity = [] }) {
  return (
    <>
      {/* Four parts of one number: a block, no dividers. Dividers between these
          would claim they are four independent readings, which is the grouping
          error one level up. */}
      {macros.length > 0 && (
        <div className={`tp-macros${macros.length === 3 ? ' is-three' : ''}`}>
          {macros.map((m) => <Cell key={m.key} {...m} />)}
        </div>
      )}
      {/* Three independent readings: a strip, dividers between them. Below
          620px .ds-statstrip stacks and the dividers become top rules, so
          three cells never leave the hole a 2-column grid would. */}
      {activity.length > 0 && (
        <div className="ds-statstrip">
          {activity.map((m) => (
            <Cell key={m.key} {...m} className="ds-statcell" style={{ flex: '1 1 160px', minWidth: 0 }} />
          ))}
        </div>
      )}
    </>
  )
}
