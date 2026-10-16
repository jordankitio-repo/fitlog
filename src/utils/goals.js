// The client's primary training goal, in one place.
//
// This list was duplicated three times in the UI (Onboarding's GOALS,
// Profile's GOAL_OPTIONS, ClientView's CLIENT_GOALS) and a fourth time as a
// CHECK inside the set_client_primary_goal RPC. The three copies agreed only
// by luck; a fifth option added to one of them would have been written, then
// rejected by the function at runtime rather than caught in review.
//
// The SQL copy cannot import this file, so it stays the authority on what is
// storable and this list must not drift from it. Changing either one means
// changing both: see supabase/migrations/20261015040000_coach_sets_client_goal.sql
export const GOALS = [
  { key: 'lose', label: 'Lose fat' },
  { key: 'gain', label: 'Build muscle' },
  { key: 'maintain', label: 'Maintain' },
  { key: 'recomp', label: 'Recomp' },
]

export const GOAL_KEYS = GOALS.map(g => g.key)

export function goalLabel(key) {
  return GOALS.find(g => g.key === key)?.label ?? null
}
