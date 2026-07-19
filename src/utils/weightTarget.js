// Weight-goal overlay for the weight-trend chart: a horizontal reference line at
// the goal, plus the first weigh-in that reached it. The chart plots raw logged
// weights, so the goal (which carries its OWN unit) must be converted into the
// series' unit or the reference line lands wildly off-scale — e.g. a 175 lb goal
// drawn on a chart of ~78 kg weigh-ins. Kept unit-aware and pure so it's testable
// and can't drift from the render.

const LB_TO_KG = 0.45359237
const KG_TO_LB = 1 / LB_TO_KG

// Anything that isn't explicitly 'kg' is treated as pounds ('lb'/'lbs'/blank).
export function normUnit(u) {
  return u === 'kg' ? 'kg' : 'lbs'
}

export function convertWeight(value, from, to) {
  const f = normUnit(from)
  const t = normUnit(to)
  if (f === t) return value
  return t === 'kg' ? value * LB_TO_KG : value * KG_TO_LB
}

// weightHistory: [{ iso, date, weight, unit? }] in chronological order.
// weightGoal / weightGoalUnit: the coach-set goal and its unit.
// Returns null when there's no usable goal or no finite weigh-ins; otherwise the
// goal in the chart's display unit, the direction to it, and the FIRST weigh-in
// that reached it (index into weightHistory, so a marker aligns with the plot).
export function computeWeightTarget({ weightHistory = [], weightGoal, weightGoalUnit = 'lbs' }) {
  const goalRaw = Number(weightGoal)
  if (!goalRaw || !Number.isFinite(goalRaw) || weightHistory.length === 0) return null

  const finite = weightHistory
    .map((p, i) => ({ i, w: Number(p.weight), unit: p.unit }))
    .filter((p) => Number.isFinite(p.w))
  if (finite.length === 0) return null

  // Plot in the unit the series is logged in (most recent row wins), falling back
  // to the goal's unit. Convert the goal into that unit for a shared axis.
  const displayUnit = normUnit(finite[finite.length - 1].unit || weightGoalUnit)
  const goal = convertWeight(goalRaw, weightGoalUnit, displayUnit)

  const start = finite[0].w
  const last = finite[finite.length - 1].w
  const TOL = displayUnit === 'kg' ? 0.05 : 0.1 // count an exact hit as reached

  // Direction is fixed by where they STARTED relative to the goal, so a client
  // who overshoots past it still reads as "reached", not "reached then missed".
  let direction = 'maintain'
  if (start > goal + TOL) direction = 'down' // must lose to reach the goal
  else if (start < goal - TOL) direction = 'up' // must gain to reach the goal

  const reachedAt = (w) =>
    direction === 'down' ? w <= goal + TOL
      : direction === 'up' ? w >= goal - TOL
        : Math.abs(w - goal) <= TOL

  let reachedIndex = -1
  for (const p of finite) {
    if (reachedAt(p.w)) { reachedIndex = p.i; break }
  }
  const reached = reachedIndex >= 0

  // Signed gap from the latest weigh-in to the goal, in display unit. Positive =
  // still above the goal, negative = below it; the component uses the magnitude.
  const remaining = Math.round((last - goal) * 10) / 10

  return {
    goal: Math.round(goal * 10) / 10,
    displayUnit,
    direction,
    reached,
    reachedIndex,
    reachedIso: reached ? weightHistory[reachedIndex].iso : null,
    reachedDate: reached ? weightHistory[reachedIndex].date : null,
    remaining,
    remainingAbs: Math.abs(remaining),
  }
}
