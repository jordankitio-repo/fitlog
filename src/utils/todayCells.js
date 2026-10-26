import { convertWeight, normUnit, unitLabel } from './weightTarget'

// The Today panel's cells (components/TodayPanel) for one day. Subs are short
// ("of 1,850") because four share a phone's width; the bar carries the
// percentage the long form used to spell out.
export function todayCells({ totals, targets, hideCalories, cardioMinutes, steps, weight }) {
  const num = (n) => Math.round(Number(n) || 0).toLocaleString()
  const pctOf = (actual, target) => (Number(target) > 0 ? Math.round((actual / target) * 100) : null)
  const of = (target, unit = '') => (Number(target) > 0 ? `of ${num(target)}${unit}` : 'No target')

  const macros = [
    ...(hideCalories ? [] : [{ key: 'calories', label: 'Calories', color: 'var(--color-calories)', value: num(totals.calories), target: targets?.calories, unit: '' }]),
    { key: 'protein', label: 'Protein', color: 'var(--color-protein)', value: `${num(totals.protein)}g`, target: targets?.protein, unit: 'g' },
    { key: 'carbs', label: 'Carbs', color: 'var(--color-carbs)', value: `${num(totals.carbs)}g`, target: targets?.carbs, unit: 'g' },
    { key: 'fat', label: 'Fat', color: 'var(--color-fat)', value: `${num(totals.fat)}g`, target: targets?.fat, unit: 'g' },
  ].map(({ target, unit, ...m }) => ({
    ...m, sub: of(target, unit), pct: pctOf(m.key === 'calories' ? totals.calories : totals[m.key], target),
  }))

  // Weight carries a GOAL, not a daily target, so it takes no bar: a track
  // from zero to a goal weight measures nothing a person can act on. Within 1
  // unit IS the goal (scale noise exceeds that).
  const goalUnit = targets?.weight_goal ? normUnit(targets.weight_goal_unit) : null
  const current = weight && goalUnit
    ? Math.round(convertWeight(weight.weight, normUnit(weight.unit), goalUnit) * 10) / 10
    : null
  const diff = current != null ? Math.round((current - Number(targets.weight_goal)) * 10) / 10 : null
  const atGoal = diff != null && Math.abs(diff) < 1
  const weightSub = !weight ? 'Not logged'
    : diff == null ? 'No goal'
    : atGoal ? 'At goal'
    : diff > 0 ? `${diff.toFixed(1)} to go`
    : `${Math.abs(diff).toFixed(1)} below goal`

  const activity = [
    {
      key: 'cardio', label: 'Cardio', color: 'var(--color-cardio)',
      value: num(cardioMinutes), denom: ' min',
      sub: of(targets?.cardio_minutes, ' min'), pct: pctOf(cardioMinutes, targets?.cardio_minutes),
    },
    {
      key: 'steps', label: 'Steps', color: 'var(--color-steps)',
      value: steps != null ? num(steps) : '—',
      sub: of(targets?.steps), pct: steps != null ? pctOf(steps, targets?.steps) : null,
    },
    {
      key: 'weight', label: 'Weight', color: 'var(--color-weight)',
      value: weight ? `${weight.weight}` : '—',
      denom: weight ? ` ${unitLabel(weight.unit)}` : null,
      sub: weightSub, subTone: atGoal ? 'success' : null, pct: null,
    },
  ]
  return { macros, activity }
}

