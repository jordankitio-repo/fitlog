// The plan in force on a given day.
//
// `targets` is the CURRENT plan; `target_versions` is its history, one row per
// day the graded values changed, written only by a database trigger
// (20261101000000_target_versions). A version applies from its effective_date
// until the next one. Every grader that reads past days must grade each day
// against ITS version, or a coach changing a target silently regrades the
// client's whole record. Design: docs/target-history-design.md.

const GRADED = 'user_id, effective_date, calories, protein, carbs, fat, cardio_minutes, steps'

// versions: rows for ONE user, any order. Returns (dateStr) => version | null,
// null before the first version (which the trigger dates 1970-01-01, so in
// practice only for a user with no plan at all).
export function makeTargetLookup(versions) {
  const sorted = [...(versions || [])].sort((a, b) => a.effective_date.localeCompare(b.effective_date))
  return (dateStr) => {
    let hit = null
    for (const v of sorted) {
      if (v.effective_date > dateStr) break
      hit = v
    }
    return hit
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
  return () => targets || null
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
