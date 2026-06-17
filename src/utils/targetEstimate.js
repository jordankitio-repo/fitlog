// Starting-point daily targets from a short onboarding assessment — the same
// flow a coach uses by hand:
//   1. BMR via Mifflin–St Jeor (most-validated predictive equation for the
//      general population; uses total weight, no body-fat % required).
//   2. TDEE = BMR × activity multiplier.
//   3. A deficit/surplus from a target RATE of weight change (% bodyweight/week
//      → kcal via ~7700 kcal/kg), derived from current vs goal weight + a pace —
//      NOT a flat % of TDEE.
//   4. Protein on GOAL weight (higher in a deficit to preserve lean mass), fat
//      with a hormonal-health floor, carbs the remainder.
// These are STARTING targets a coach (or solo user) reviews and refines — intake
// math on self-reported stats, not a precision estimate mined from logged data
// (the no-fabricated-confidence rule in decisions.md is about logged-data TDEE).

export const ACTIVITY_LEVELS = [
  { key: 'sedentary', label: 'Sedentary — little/no exercise', mult: 1.2 },
  { key: 'light', label: 'Light — 1–3 days/wk', mult: 1.375 },
  { key: 'moderate', label: 'Moderate — 3–5 days/wk', mult: 1.55 },
  { key: 'very', label: 'Very active — 6–7 days/wk', mult: 1.725 },
  { key: 'athlete', label: 'Athlete — hard training 2×/day', mult: 1.9 },
]

// Pace = target rate of weight change as a fraction of bodyweight per week.
// Fat loss tolerates a faster rate than lean gain (gaining faster = more fat).
export const PACES = [
  { key: 'gentle', label: 'Gentle' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'aggressive', label: 'Aggressive' },
]
const RATE = {
  lose: { gentle: 0.005, moderate: 0.0075, aggressive: 0.01 }, // 0.5–1%/wk
  gain: { gentle: 0.0020, moderate: 0.0035, aggressive: 0.005 }, // 0.2–0.5%/wk
}

const KCAL_PER_KG = 7700          // ~energy in 1 kg of body mass (≈3500 kcal/lb)
const MAINTAIN_THRESHOLD_KG = 1   // |goal − current| under this ⇒ maintain/recomp

const LB_TO_KG = 0.45359237
const toKg = (w, unit) => (unit === 'kg' ? w : w * LB_TO_KG)
const toCm = (h, unit) => (unit === 'cm' ? h : h * 2.54)

// Returns { calories, protein, carbs, fat, maintenanceCalories, direction,
// weeklyChange, weeksToGoal } or null if core inputs are incomplete.
// goalWeight is optional — blank ⇒ maintenance.
export function estimateTargets({
  sex = 'male', age, weight, goalWeight, weightUnit = 'lbs',
  height, heightUnit = 'in', activity = 'moderate', pace = 'moderate', bodyFat,
}) {
  const a = Number(age)
  const isKg = weightUnit === 'kg'
  const kg = toKg(Number(weight), isKg ? 'kg' : 'lb')
  const cm = toCm(Number(height), heightUnit === 'cm' ? 'cm' : 'in')
  if (!a || a <= 0 || !kg || kg <= 0 || !cm || cm <= 0) return null

  const goalRaw = Number(goalWeight)
  const goalKg = goalRaw > 0 ? toKg(goalRaw, isKg ? 'kg' : 'lb') : kg

  // 1–2. BMR → TDEE. If a body-fat % is given, use Katch–McArdle (lean-mass
  // based — more accurate, and what physique coaches use); else Mifflin–St Jeor.
  const bf = Number(bodyFat)
  const hasBF = bf >= 3 && bf <= 60
  const lbmKg = hasBF ? kg * (1 - bf / 100) : null
  const method = hasBF ? 'katch' : 'mifflin'
  const bmr = hasBF
    ? 370 + 21.6 * lbmKg
    : (sex === 'female'
        ? 10 * kg + 6.25 * cm - 5 * a - 161
        : 10 * kg + 6.25 * cm - 5 * a + 5)
  const mult = (ACTIVITY_LEVELS.find((l) => l.key === activity) || { mult: 1.55 }).mult
  const tdee = bmr * mult
  const maintenanceCalories = Math.round(tdee / 10) * 10

  // 3. Direction + rate-based deficit/surplus.
  const diffKg = goalKg - kg // negative = lose, positive = gain
  let direction = 'maintain'
  if (diffKg <= -MAINTAIN_THRESHOLD_KG) direction = 'lose'
  else if (diffKg >= MAINTAIN_THRESHOLD_KG) direction = 'gain'

  let calories = tdee
  if (direction !== 'maintain') {
    const ratePct = (RATE[direction][pace] ?? RATE[direction].moderate)
    const weeklyKg = ratePct * kg
    const dailyAdjust = (weeklyKg * KCAL_PER_KG) / 7
    calories = direction === 'lose' ? tdee - dailyAdjust : tdee + dailyAdjust
  }
  // Never default below BMR (or an absolute floor).
  calories = Math.max(1200, Math.round(bmr), calories)
  calories = Math.round(calories / 10) * 10

  // 4. Macros. Protein on GOAL weight (avoids overprescribing for higher-fat
  // clients); push it up in a deficit to protect lean mass. Fat 25% kcal with a
  // ~0.8 g/kg hormonal-health floor; carbs are the remainder.
  // With body-fat known, base protein on LEAN mass (the gold standard); else on
  // goal weight. Higher in a deficit either way, to protect lean mass.
  const protein = hasBF
    ? Math.round((direction === 'lose' ? 2.4 : 2.0) * lbmKg)
    : Math.round((direction === 'lose' ? 2.2 : 1.8) * goalKg)
  const fat = Math.round(Math.max((calories * 0.25) / 9, 0.8 * goalKg))
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4))

  // Timeline from the ACTUAL (possibly floored) deficit/surplus, so it stays
  // honest when the calorie floor slows the requested pace.
  let weeklyChangeKg = 0
  let weeksToGoal = null
  if (direction !== 'maintain') {
    const actualDaily = Math.abs(tdee - calories)
    weeklyChangeKg = (actualDaily * 7) / KCAL_PER_KG
    weeksToGoal = weeklyChangeKg > 0 ? Math.round(Math.abs(diffKg) / weeklyChangeKg) : null
  }
  const weeklyChange = Math.round((isKg ? weeklyChangeKg : weeklyChangeKg / LB_TO_KG) * 100) / 100

  return { calories, protein, carbs, fat, maintenanceCalories, direction, weeklyChange, weeksToGoal, method }
}
