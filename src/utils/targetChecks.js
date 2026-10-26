// Checks on a set of daily targets before they are saved, shared by the
// coach's form (ClientView) and the solo user's own (Profile).
//
// The form saved whatever was typed: a fat target of -20 g went through, and so
// did 2,500 calories beside macros that add up to 744. A blank is fine (it
// means "not tracked"); a number outside what any person could be given is not.

// Inclusive bounds per field. Generous on purpose: these catch typos and signs,
// not coaching decisions.
const BOUNDS = {
  calories: [500, 10000],
  protein: [0, 1000],
  carbs: [0, 1500],
  fat: [0, 500],
  cardio_minutes: [0, 600],
  steps: [0, 100000],
}
const WEIGHT_BOUNDS = { lbs: [50, 1000], kg: [20, 450] }

// Calories in a gram of each macro (the Atwater factors every tracker uses).
export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 }

const blank = (v) => v === '' || v == null

// { errors: { field: message }, macroCalories, mismatch }
// `macroCalories` is null until all three macros are filled in. `mismatch` is
// true when they and the calorie target differ by more than 5%.
export function checkTargets(t) {
  const errors = {}
  for (const [key, [lo, hi]] of Object.entries(BOUNDS)) {
    if (blank(t[key])) continue
    const n = Number(t[key])
    if (!Number.isFinite(n) || n < lo || n > hi || !Number.isInteger(n)) {
      errors[key] = `Enter a whole number from ${lo.toLocaleString()} to ${hi.toLocaleString()}`
    }
  }
  if (!blank(t.weight_goal)) {
    const unit = t.weight_goal_unit === 'kg' ? 'kg' : 'lbs'
    const [lo, hi] = WEIGHT_BOUNDS[unit]
    const n = Number(t.weight_goal)
    if (!Number.isFinite(n) || n < lo || n > hi) {
      errors.weight_goal = `Enter ${lo} to ${hi} ${unit === 'kg' ? 'kg' : 'lb'}`
    }
  }

  const macros = ['protein', 'carbs', 'fat']
  const macroCalories = macros.every(k => !blank(t[k]) && !errors[k])
    ? macros.reduce((sum, k) => sum + Number(t[k]) * KCAL_PER_GRAM[k], 0)
    : null
  const cal = Number(t.calories)
  const mismatch = macroCalories != null && !blank(t.calories) && !errors.calories && cal > 0
    && Math.abs(macroCalories - cal) / cal > 0.05

  return { errors, macroCalories, mismatch }
}
