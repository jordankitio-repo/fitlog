// The plan in force on a given day -- the edge-function twin of
// src/utils/targetHistory.js (functions cannot import src/). A version applies
// from its effective_date until the next one; see
// supabase/migrations/20261101000000_target_versions.sql.

export type TargetVersion = { effective_date: string; [field: string]: unknown }

// versions: rows for ONE user, any order. Returns (date) => version | null.
export function makeTargetLookup(versions: TargetVersion[]) {
  const sorted = [...(versions || [])].sort((a, b) => a.effective_date.localeCompare(b.effective_date))
  return (date: string): TargetVersion | null => {
    let hit: TargetVersion | null = null
    for (const v of sorted) {
      if (v.effective_date > date) break
      hit = v
    }
    return hit
  }
}
