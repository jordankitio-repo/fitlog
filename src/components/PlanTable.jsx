import { dayPlanDaysLabel } from '../utils/targetChecks'

// A client's targets when their plan has day types (targets.day_plans): one
// column per kind of day, every target in every column. A day type stores
// only the numbers that differ, and listing just those made a "Rest" day look
// as if it had two targets instead of six. So each column is the whole plan
// for those days; an inherited number is muted, and a line under the table
// says what muted means (colour alone never carries it).
//
// Read-only. The coach edits in components/DayPlansEditor. A real <table>,
// because this is a grid people read across and down: the columns are
// declared once, so they line up by construction (design-system A4).

const ROWS = [
  ['calories', 'Calories'], ['protein', 'Protein (g)'], ['carbs', 'Carbs (g)'],
  ['fat', 'Fat (g)'], ['cardio_minutes', 'Cardio (min)'], ['steps', 'Steps'],
]
const set = (v) => v !== '' && v != null && Number.isFinite(Number(v))

// Column heads are a NAME the coach typed plus its days, not a generic column
// label, so they take the row-primary treatment rather than the uppercase
// eyebrow (which wrapped "OTHER DAYS" to two lines beside a one-line
// "TRAINING" and left the names at different heights). Top-aligned, so every
// name sits on one line however its days wrap.
const head = { fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--color-text)', textAlign: 'right', padding: '0 0 var(--space-8) var(--space-12)', verticalAlign: 'top' }
const cell = { fontSize: 'var(--text-base)', textAlign: 'right', padding: 'var(--space-10) 0 var(--space-10) var(--space-12)' }

// base: { calories, ... } (numbers or strings); plans: stored day_plans.
export default function PlanTable({ base, plans, hideCalories = false }) {
  const covered = new Set(plans.flatMap(p => p.days || []))
  const otherDays = [0, 1, 2, 3, 4, 5, 6].filter(w => !covered.has(w))
  // A column per kind of day. "Other days" goes when the types cover the week.
  const columns = [
    ...(otherDays.length ? [{ key: 'base', name: 'Other days', days: otherDays, values: base, own: () => true }] : []),
    ...plans.map((p, i) => ({ key: `p${i}`, name: p.name, days: p.days, values: p, own: (k) => set(p[k]) })),
  ]
  const rows = ROWS.filter(([k]) => !(hideCalories && k === 'calories'))
  let inherits = false

  const body = rows.map(([k, label], ri) => (
    <tr key={k}>
      <th scope="row" style={{ ...cell, textAlign: 'left', padding: 'var(--space-10) 0', fontWeight: 'var(--weight-normal)', color: 'var(--color-text)', borderTop: ri ? '1px solid var(--color-border)' : 'none' }}>{label}</th>
      {columns.map(c => {
        const own = c.own(k)
        const v = own ? c.values[k] : base[k]
        if (!own) inherits = true
        // 0 is "no target on these days"; blank is "not set".
        const text = !set(v) ? 'Not set' : Number(v) === 0 ? 'None' : Number(v).toLocaleString()
        const quiet = !own || !set(v)
        return (
          <td key={c.key} className="tnum" style={{ ...cell, borderTop: ri ? '1px solid var(--color-border)' : 'none', color: quiet ? 'var(--color-muted)' : 'var(--color-text)', fontWeight: quiet ? 'var(--weight-normal)' : 'var(--weight-medium)' }}>
            {text}
          </td>
        )
      })}
    </tr>
  ))

  return (
    <div>
      {/* Auto layout: the label column takes its longest label and the day
          columns share the rest, which fixed percentages could not do at
          390px without wrapping "Other days". */}
      <table aria-label="Your targets by day" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <td />
            {columns.map(c => (
              <th key={c.key} scope="col" style={{ ...head, ...(c.key === 'base' ? { whiteSpace: 'nowrap' } : null) }}>
                {c.name}
                <span style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-normal)', color: 'var(--color-muted)', marginTop: 'var(--space-2)' }}>{dayPlanDaysLabel(c.days)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
      {inherits && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', margin: 'var(--space-8) 0 0' }}>
          {otherDays.length ? 'Muted numbers are the same as on other days.' : 'Muted numbers carry over from your main targets.'}
        </p>
      )}
    </div>
  )
}
