// Starting-point daily targets from a short onboarding assessment. Mifflin–St
// Jeor BMR × activity multiplier → TDEE, a goal-based calorie factor, protein
// from bodyweight, and a fat/carb split. These are STARTING targets a coach (or
// a solo user) reviews and refines — standard intake math on self-reported
// stats, NOT a precision estimate mined from logged data (see decisions.md
// "no fabricated-confidence numbers"; that rule is about logged-data TDEE).

export const ACTIVITY_LEVELS = [
  { key: 'sedentary', label: 'Sedentary — little/no exercise', mult: 1.2 },
  { key: 'light', label: 'Light — 1–3 days/wk', mult: 1.375 },
  { key: 'moderate', label: 'Moderate — 3–5 days/wk', mult: 1.55 },
  { key: 'very', label: 'Very active — 6–7 days/wk', mult: 1.725 },
  { key: 'athlete', label: 'Athlete — hard training 2×/day', mult: 1.9 },
]

export const GOALS = [
  { key: 'lose', label: 'Lose fat', factor: 0.8 },      // ~20% deficit
  { key: 'maintain', label: 'Maintain', factor: 1.0 },
  { key: 'gain', label: 'Build muscle', factor: 1.1 },  // ~10% surplus
]

const toKg = (w, unit) => (unit === 'kg' ? w : w * 0.45359237)
const toCm = (h, unit) => (unit === 'cm' ? h : h * 2.54)

// Returns { calories, protein, carbs, fat } or null if inputs are incomplete.
export function estimateTargets({
  sex = 'male', age, weight, weightUnit = 'lbs', height, heightUnit = 'in',
  activity = 'moderate', goal = 'maintain',
}) {
  const a = Number(age)
  const kg = toKg(Number(weight), weightUnit === 'kg' ? 'kg' : 'lb')
  const cm = toCm(Number(height), heightUnit === 'cm' ? 'cm' : 'in')
  if (!a || a <= 0 || !kg || kg <= 0 || !cm || cm <= 0) return null

  const bmr = sex === 'female'
    ? 10 * kg + 6.25 * cm - 5 * a - 161
    : 10 * kg + 6.25 * cm - 5 * a + 5
  const mult = (ACTIVITY_LEVELS.find((l) => l.key === activity) || { mult: 1.55 }).mult
  const factor = (GOALS.find((g) => g.key === goal) || { factor: 1 }).factor

  const calories = Math.max(1200, Math.round((bmr * mult * factor) / 10) * 10)
  const protein = Math.round(1.8 * kg)                      // 1.8 g/kg
  const fat = Math.round((calories * 0.25) / 9)             // 25% of calories
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4)) // remainder

  return { calories, protein, carbs, fat }
}
