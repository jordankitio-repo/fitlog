// The plan in force on a given day -- the edge-function twin of
// src/utils/targetHistory.js (functions cannot import src/). A version applies
// from its effective_date until the next one; on each date the weekday's day
// type (targets.day_plans) is laid over the base. See
// supabase/migrations/20261101000000_target_versions.sql and
// 20261102000000_target_day_plans.sql.

export type TargetVersion = { effective_date: string; [field: string]: unknown }

const TARGET_KEYS = ['calories', 'protein', 'carbs', 'fat', 'cardio_minutes', 'steps']
const filled = (v: unknown) => v !== '' && v != null && Number.isFinite(Number(v))

// 0 = Sunday, read off the calendar date so it cannot shift with a timezone.
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()

// The base targets with that weekday's day type laid over them; blank fields
// inherit. Adds day_type (the name, or null). Malformed day_plans are ignored.
export function resolveDay(plan: Record<string, any> | null, date: string) {
  if (!plan) return null
  const w = weekdayOf(date)
  const types = Array.isArray(plan.day_plans) ? plan.day_plans : []
  const type = types.find((p: any) => Array.isArray(p?.days) && p.days.includes(w))
  if (!type) return { ...plan, day_type: null }
  const out: Record<string, any> = { ...plan, day_type: type.name || null }
  for (const key of TARGET_KEYS) if (filled(type[key])) out[key] = Number(type[key])
  return out
}

// True when the base or any day type sets a real (> 0) target; 0 is "no target".
const positive = (v: unknown) => filled(v) && Number(v) > 0
export const setsAnyDay = (plan: Record<string, any> | null, key: string) =>
  positive(plan?.[key]) || (Array.isArray(plan?.day_plans) && plan!.day_plans.some((p: any) => positive(p?.[key])))

// versions: rows for ONE user, any order. Returns (date) => resolved targets | null.
export function makeTargetLookup(versions: TargetVersion[]) {
  const sorted = [...(versions || [])].sort((a, b) => a.effective_date.localeCompare(b.effective_date))
  return (date: string) => {
    let hit: TargetVersion | null = null
    for (const v of sorted) {
      if (v.effective_date > date) break
      hit = v
    }
    return resolveDay(hit as Record<string, any> | null, date)
  }
}
