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

// Day types (targets.day_plans): the form's shape, and the stored one.
//
// In the form a day type is { name, days: [0-6], calories: '', ... } with the
// six targets as strings. Blank means "same as other days", so each type is
// checked on its MERGED values (base with the type laid over it): a training
// day that only raises carbs is checked, and its macro note computed, against
// the calories it actually ends up with.
export const DAY_PLAN_KEYS = ['calories', 'protein', 'carbs', 'fat', 'cardio_minutes', 'steps']
export const MAX_DAY_PLANS = 2
export const DAY_PLAN_NAME_MAX = 24

export const emptyDayPlan = () => ({ name: '', days: [], ...Object.fromEntries(DAY_PLAN_KEYS.map(k => [k, ''])) })

// [{ errors: { name?, days?, <key>? }, macroCalories, mismatch }], one per type.
export function checkDayPlans(base, plans) {
  return (plans || []).map((p) => {
    const merged = { ...base }
    for (const k of DAY_PLAN_KEYS) if (!blank(p[k])) merged[k] = p[k]
    const merge = checkTargets(merged)
    // Report a range error only on a field this type sets; the base field
    // shows its own.
    const errors = {}
    for (const k of DAY_PLAN_KEYS) if (!blank(p[k]) && merge.errors[k]) errors[k] = merge.errors[k]
    const name = (p.name || '').trim()
    if (!name) errors.name = 'Name this day type'
    else if (name.length > DAY_PLAN_NAME_MAX) errors.name = `${DAY_PLAN_NAME_MAX} characters at most`
    if (!p.days?.length) errors.days = 'Pick at least one day'
    return { errors, macroCalories: merge.macroCalories, mismatch: merge.mismatch }
  })
}

export const dayPlansHaveErrors = (checks) => checks.some(c => Object.keys(c.errors).length > 0)

// Form -> stored: numbers or null, trimmed name, sorted days.
export function dayPlansToRow(plans) {
  return (plans || []).map((p) => ({
    name: (p.name || '').trim(),
    days: [...(p.days || [])].sort((a, b) => a - b),
    ...Object.fromEntries(DAY_PLAN_KEYS.map(k => [k, blank(p[k]) ? null : parseInt(p[k], 10)])),
  }))
}

// Stored -> form.
export function dayPlansFromRow(rows) {
  return (Array.isArray(rows) ? rows : []).map((p) => ({
    name: p?.name || '',
    days: Array.isArray(p?.days) ? [...p.days] : [],
    ...Object.fromEntries(DAY_PLAN_KEYS.map(k => [k, p?.[k] == null ? '' : String(p[k])])),
  }))
}

// Toggle weekday `w` on type `i`. Each weekday belongs to at most one type,
// and a day another type already holds is NOT taken from it: the coach frees
// it there first. (It used to move silently, which could empty the other
// type's schedule without the coach looking at it.)
export function toggleDayPlanDay(plans, i, w) {
  if (plans.some((p, j) => j !== i && p.days.includes(w))) return plans
  return plans.map((p, j) => (j === i
    ? { ...p, days: p.days.includes(w) ? p.days.filter(d => d !== w) : [...p.days, w] }
    : p))
}

// Same plans? (the form's dirty check). Compares the stored shape.
export const sameDayPlans = (a, b) => JSON.stringify(dayPlansToRow(a)) === JSON.stringify(dayPlansToRow(b))

// "Mon, Wed, Fri": a day type's weekdays, Monday first.
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const dayPlanDaysLabel = (days) =>
  [1, 2, 3, 4, 5, 6, 0].filter(w => (days || []).includes(w)).map(w => SHORT_DAYS[w]).join(', ')
