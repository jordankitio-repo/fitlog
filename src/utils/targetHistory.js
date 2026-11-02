// The plan in force on a given day.
//
// `targets` is the CURRENT plan; `target_versions` is its history, one row per
// day the graded values changed, written only by a database trigger
// (20261101000000_target_versions). A version applies from its effective_date
// until the next one. Every grader that reads past days must grade each day
// against ITS version, or a coach changing a target silently regrades the
// client's whole record. Design: docs/target-history-design.md.

const GRADED = 'user_id, effective_date, calories, protein, carbs, fat, cardio_minutes, steps, day_plans'

export const TARGET_KEYS = ['calories', 'protein', 'carbs', 'fat', 'cardio_minutes', 'steps']

// 0 = Sunday, as JS getDay() and targets.day_plans[].days. Read off the
// calendar date itself, so it cannot shift with the reader's timezone.
export const weekdayOf = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay()

const filled = (v) => v !== '' && v != null && Number.isFinite(Number(v))

// The plan for one calendar day: the base targets with that weekday's day type
// (targets.day_plans, 20261102000000) laid over them. A blank field in a day
// type means "same as other days". Adds `day_type`: the type's name, or null.
// Anything malformed in day_plans is ignored rather than trusted.
export function resolveDay(plan, dateStr) {
  if (!plan) return null
  const w = weekdayOf(dateStr)
  const type = (Array.isArray(plan.day_plans) ? plan.day_plans : [])
    .find((p) => Array.isArray(p?.days) && p.days.includes(w))
  if (!type) return { ...plan, day_type: null }
  const out = { ...plan, day_type: type.name || null }
  for (const key of TARGET_KEYS) if (filled(type[key])) out[key] = Number(type[key])
  return out
}

// The mean of one target over the seven weekdays, for where a single number
// has to stand for the week (the energy-balance read). Null when not set.
export function weeklyAverage(plan, key) {
  if (!plan) return null
  const days = [0, 1, 2, 3, 4, 5, 6].map((w) => resolveDay(plan, dayOfWeekDate(w))?.[key])
  if (!days.every(filled)) return filled(plan[key]) ? Number(plan[key]) : null
  return Math.round(days.reduce((a, b) => a + Number(b), 0) / 7)
}

// { min, max } of one target across the week; min === max when it never varies.
export function targetRange(plan, key) {
  if (!plan) return null
  const vals = [0, 1, 2, 3, 4, 5, 6].map((w) => resolveDay(plan, dayOfWeekDate(w))?.[key]).filter(filled).map(Number)
  if (!vals.length) return null
  return { min: Math.min(...vals), max: Math.max(...vals) }
}

// True when the base or any day type sets a real target for this metric (a
// metric graded only on some days). A 0 is "no target on these days", the same
// as everywhere else in the app, so it does not count.
const positive = (v) => filled(v) && Number(v) > 0
export const setsAnyDay = (plan, key) =>
  positive(plan?.[key]) || (Array.isArray(plan?.day_plans) && plan.day_plans.some((p) => positive(p?.[key])))

// A fixed date for each weekday (2023-01-01 was a Sunday).
const dayOfWeekDate = (w) => `2023-01-0${w + 1}`

// versions: rows for ONE user, any order. Returns (dateStr) => version | null,
// null before the first version (which the trigger dates 1970-01-01, so in
// practice only for a user with no plan at all).
//
// The answer is that day's RESOLVED targets (resolveDay): the version in force,
// with the weekday's day type applied.
export function makeTargetLookup(versions) {
  const sorted = [...(versions || [])].sort((a, b) => a.effective_date.localeCompare(b.effective_date))
  return (dateStr) => {
    let hit = null
    for (const v of sorted) {
      if (v.effective_date > dateStr) break
      hit = v
    }
    return resolveDay(hit, dateStr)
  }
}

// A grader's view of one field: (dateStr) => number (0 = no target that day).
// Takes either a lookup from makeTargetLookup or a plain number, so every
// existing caller and test keeps working while each one migrates.
export function targetFn(target, key = 'calories') {
  if (typeof target === 'function') return (d) => Number(target(d)?.[key]) || 0
  const n = Number(target) || 0
  return () => n
}

// A lookup that answers the current plan for every day. The fallback when the
// history could not be loaded: today's behaviour, never a blank page.
export function constantLookup(targets) {
  return (dateStr) => (targets ? resolveDay(targets, dateStr) : null)
}

// "Training" -> "Training day"; a name that already says day is left alone.
export const dayTypeLabel = (name) => (!name ? '' : /\bday$/i.test(name.trim()) ? name.trim() : `${name.trim()} day`)

// One day's targets for a screen that shows a single day (Log, the coach's
// day stepper): the current row (weight goal and all) with that day's graded
// numbers from the history lookup, or from the current row's own day types
// when the history is not loaded. Carries `day_type`.
export function targetsOnDay(current, lookup, dateStr) {
  if (!current) return null
  const day = (lookup && lookup(dateStr)) || resolveDay(current, dateStr)
  const out = { ...current, day_type: day?.day_type ?? null }
  for (const key of TARGET_KEYS) out[key] = day ? day[key] ?? null : current[key]
  return out
}

// Versions for one or more users, grouped: { [userId]: lookup }.
export async function fetchTargetLookups(supabase, userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))]
  if (!ids.length) return {}
  const { data, error } = await supabase.from('target_versions').select(GRADED).in('user_id', ids)
  if (error) throw error
  const byUser = {}
  for (const row of data || []) (byUser[row.user_id] ||= []).push(row)
  return Object.fromEntries(ids.map((id) => [id, makeTargetLookup(byUser[id] || [])]))
}

// One user's lookup, falling back to the current plan if the history fetch
// fails (for example a database the migration has not reached yet).
export async function fetchTargetLookup(supabase, userId, currentTargets) {
  try {
    const lookups = await fetchTargetLookups(supabase, [userId])
    return lookups[userId]
  } catch (err) {
    console.error('Error fetching target history:', err)
    return constantLookup(currentTargets)
  }
}
