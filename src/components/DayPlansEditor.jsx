import { Fragment, useState } from 'react'
import Button from './Button'
import { Field, Icon, Pill } from './ui'
import { DAY_PLAN_KEYS, MAX_DAY_PLANS, DAY_PLAN_NAME_MAX, emptyDayPlan, toggleDayPlanDay, dayPlanDaysLabel } from '../utils/targetChecks'

// The daily targets, with day types: different targets on some weekdays
// (targets.day_plans). One component for the coach's form (ClientView ›
// Targets) and the solo user's own (Profile › Daily targets), because those two
// forms have drifted apart before. Design: docs/day-targets-design.md.
//
// ONE strip of chips, one per kind of day ("Other days", then each type, then
// "Add day type"), and below it the selected day's targets only. A coach plans
// by the day ("what does a training day look like?"), so each chip is a whole
// day. Stacking every type's six fields made the form grow ~360px per type;
// one selection at a time keeps it the length of a single plan. Each chip
// carries that day's calories so the types compare without clicking through.
//
// `children` is the parent's own fields for the base targets; they ARE the
// "Other days" selection. A blank field in a type means "same as other days",
// so each type's placeholders are the values it inherits.

const LABELS = {
  calories: 'Calories', protein: 'Protein (g)', carbs: 'Carbs (g)', fat: 'Fat (g)',
  cardio_minutes: 'Cardio (min/day)', steps: 'Steps/day',
}
// Monday first, as the weekday rings are. Values are getDay() numbers.
const WEEK = [[1, 'M', 'Monday'], [2, 'T', 'Tuesday'], [3, 'W', 'Wednesday'], [4, 'T', 'Thursday'], [5, 'F', 'Friday'], [6, 'S', 'Saturday'], [0, 'S', 'Sunday']]

const muted = { fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: 0 }
const filled = (v) => v !== '' && v != null && Number.isFinite(Number(v))
const typeName = (p) => p.name.trim() || 'New day type'

export default function DayPlansEditor({ base, plans, checks, onChange, note, children }) {
  // 'base' or the index of a type. Kept valid as types come and go.
  const [picked, setPicked] = useState('base')
  const [justAdded, setJustAdded] = useState(false)
  const selected = picked === 'base' || picked >= plans.length ? 'base' : picked
  const set = (i, patch) => onChange(plans.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  const add = () => {
    onChange([...plans, emptyDayPlan()])
    setPicked(plans.length)
    setJustAdded(true)
  }

  // No day types: the plain form, and the way in.
  if (!plans.length) {
    return (
      <>
        {children}
        <div style={{ margin: 'var(--space-4) 0 var(--space-8)' }}>
          <Button variant="ghost" size="sm" onClick={add}>
            <Icon name="plus" />
            Different targets on some days
          </Button>
        </div>
      </>
    )
  }

  // "Other days · 2,000": the day's calories on its chip, inherited or own.
  const chipCalories = (p) => {
    const v = p && filled(p.calories) ? p.calories : base.calories
    return filled(v) ? ` · ${Number(v).toLocaleString()}` : ''
  }
  const covered = new Set(plans.flatMap(p => p.days))
  const otherDays = [0, 1, 2, 3, 4, 5, 6].filter(w => !covered.has(w))
  // The selected type shows its own errors inline; the others are named here,
  // so a problem on a chip you are not looking at is not invisible.
  const elsewhere = plans
    .map((p, i) => ({ i, p, first: Object.values(checks[i]?.errors || {})[0] }))
    .filter(x => x.first && x.i !== selected)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)', margin: 'var(--space-4) 0 var(--space-16)' }}>
      <div className="ds-chipstrip" role="group" aria-label="Day types">
        <Pill active={selected === 'base'} aria-pressed={selected === 'base'} onClick={() => setPicked('base')}>
          Other days{chipCalories(null)}
        </Pill>
        {plans.map((p, i) => (
          <Pill key={i} active={selected === i} aria-pressed={selected === i} onClick={() => { setPicked(i); setJustAdded(false) }}>
            {typeName(p)}{chipCalories(p)}
          </Pill>
        ))}
        {plans.length < MAX_DAY_PLANS && (
          <Pill onClick={add} aria-label="Add a day type">
            <Icon name="plus" />
            Add day type
          </Pill>
        )}
      </div>
      {elsewhere.map(x => (
        <p key={x.i} style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-error)' }}>
          {typeName(x.p)}: {x.first.charAt(0).toLowerCase() + x.first.slice(1)}.
        </p>
      ))}

      {selected === 'base' ? (
        // display: contents, so the parent's field groups sit in this column's
        // gap like everything else here, whatever wrapper they came in.
        <div style={{ display: 'contents' }}>
          {children}
          <p style={{ ...muted, fontSize: 'var(--text-xs)' }}>
            {otherDays.length ? `Applies on ${dayPlanDaysLabel(otherDays)}.` : 'Every day has a day type, so these apply only where a day type leaves a field blank.'}
          </p>
        </div>
      ) : (() => {
        const i = selected
        const p = plans[i]
        const c = checks[i] || { errors: {} }
        const other = plans.find((q, j) => j !== i)
        // No red on a type the coach has only just added: each prompt waits
        // until it is the next step. The days prompt once there is a name or a
        // number; the name prompt once there are days or a number. Save stays
        // disabled meanwhile, and a type left half-done is named under the strip.
        const anyValue = DAY_PLAN_KEYS.some(k => filled(p[k]))
        const nameError = (p.days.length || anyValue) ? c.errors.name : null
        const daysError = (p.name.trim() || anyValue) ? c.errors.days : null
        return (
          // Keyed per type, so switching types or adding one mounts a fresh
          // form: the Name field of a new type takes focus, and no input keeps
          // the previous type's DOM state.
          <div key={`type-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
            <Field
              label="Name"
              placeholder="e.g. Training"
              maxLength={DAY_PLAN_NAME_MAX}
              value={p.name}
              error={nameError}
              autoFocus={justAdded}
              onChange={(e) => set(i, { name: e.target.value })}
            />
            <div>
              <p style={{ ...muted, marginBottom: 'var(--space-6)' }}>Days</p>
              <div className="ds-chipstrip" role="group" aria-label={`Days for ${typeName(p)}`}>
                {WEEK.map(([w, short, full]) => {
                  const on = p.days.includes(w)
                  // Held by the other type: shown, but not pickable here.
                  const taken = !on && other?.days.includes(w)
                  return (
                    <Pill
                      key={w}
                      active={on}
                      aria-pressed={on}
                      disabled={taken}
                      aria-label={taken ? `${full}, in ${typeName(other)}` : full}
                      onClick={() => onChange(toggleDayPlanDay(plans, i, w))}
                    >
                      {short}
                    </Pill>
                  )
                })}
              </div>
              {other?.days.length > 0 && (
                <p style={{ ...muted, fontSize: 'var(--text-xs)', marginTop: 'var(--space-6)' }}>
                  {dayPlanDaysLabel(other.days)} {other.days.length === 1 ? 'is' : 'are'} in {typeName(other)}. Remove {other.days.length === 1 ? 'it' : 'them'} there to use {other.days.length === 1 ? 'it' : 'them'} here.
                </p>
              )}
              {daysError && <p style={{ margin: 'var(--space-6) 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-error)' }}>{daysError}</p>}
            </div>
            {[DAY_PLAN_KEYS.slice(0, 4), DAY_PLAN_KEYS.slice(4)].map((group, gi) => (
              <Fragment key={gi}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-12)' }}>
                  {group.map((k) => (
                    <Field
                      key={k}
                      label={LABELS[k]}
                      type="number"
                      inputMode="numeric"
                      // The value it inherits when left blank.
                      placeholder={filled(base[k]) ? String(base[k]) : ''}
                      value={p[k]}
                      error={c.errors[k]}
                      aria-invalid={Boolean(c.errors[k])}
                      onChange={(e) => set(i, { [k]: e.target.value })}
                    />
                  ))}
                </div>
                {gi === 0 && c.macroCalories != null && (
                  <p style={{ ...muted, color: c.mismatch ? 'var(--color-warning)' : 'var(--color-muted)' }}>
                    Macros add up to {c.macroCalories.toLocaleString()} cal{c.mismatch ? ' on these days, not the calorie target.' : ''}
                  </p>
                )}
              </Fragment>
            ))}
            {/* Blank inherits, so "no target on these days" needs its own
                spelling: 0, which every grader and the client's Today already
                read as no target. */}
            <p style={{ ...muted, fontSize: 'var(--text-xs)' }}>Leave a field blank to use the same target as other days. Enter 0 for no target on these days.</p>
            <div>
              <Button variant="ghost" size="sm" onClick={() => { onChange(plans.filter((_, j) => j !== i)); setPicked('base') }}>
                <Icon name="trash" />
                Remove {typeName(p)}
              </Button>
            </div>
          </div>
        )
      })()}
      {note && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-faint)', margin: 0 }}>{note}</p>}
    </div>
  )
}
