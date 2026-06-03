// Lock mechanic - computed, no DB write needed from client
export function resolveLockState({ lastNutritionDate, connectionCreatedAt, lockClearedAt }) {
  const LOCK_AFTER = 3
  const AUTO_UNLOCK_AFTER = 7
  const COACH_GRACE_HOURS = 48
  function daysSince(dateStr) {
    const a = new Date(dateStr + 'T00:00:00')
    const now = new Date()
    const b = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return Math.floor((b - a) / 86400000)
  }
  const baseline = lastNutritionDate || connectionCreatedAt
  const days = daysSince(baseline)
  if (days < LOCK_AFTER) return { locked: false, days, reason: 'active' }
  if (days >= LOCK_AFTER + AUTO_UNLOCK_AFTER) return { locked: false, days, reason: 'auto-unlocked' }
  if (lockClearedAt && new Date(lockClearedAt) > new Date(baseline + 'T23:59:59')) {
    const graceExpiry = new Date(new Date(lockClearedAt).getTime() + COACH_GRACE_HOURS * 60 * 60 * 1000)
    if (new Date() < graceExpiry) return { locked: false, days, reason: 'coach-unlocked' }
  }
  return { locked: true, days, reason: 'locked' }
}
