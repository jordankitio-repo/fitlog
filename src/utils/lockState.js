// Lock mechanic - computed, no DB write needed from client
//
// `pausedUntil` (YYYY-MM-DD, coach_clients.paused_until): a client whose coach
// paused them is never locked during the pause, and the end of the pause
// counts as the coach clearing the lock, so a client back from a fortnight
// away gets the same 48 hours to log that a coach's unlock gives, rather than
// coming back to a locked screen.
export function resolveLockState({ lastNutritionDate, connectionCreatedAt, lockClearedAt, pausedUntil = null }) {
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
  if (pausedUntil && daysSince(pausedUntil) <= 0) return { locked: false, days, reason: 'paused' }
  if (pausedUntil) {
    const [y, m, d] = pausedUntil.split('-').map(Number)
    const pauseEnded = new Date(y, m - 1, d + 1).toISOString()
    if (!lockClearedAt || new Date(pauseEnded) > new Date(lockClearedAt)) lockClearedAt = pauseEnded
  }
  if (days < LOCK_AFTER) return { locked: false, days, reason: 'active' }
  if (days >= LOCK_AFTER + AUTO_UNLOCK_AFTER) return { locked: false, days, reason: 'auto-unlocked' }
  if (lockClearedAt && new Date(lockClearedAt) > new Date(baseline + 'T23:59:59')) {
    const graceExpiry = new Date(new Date(lockClearedAt).getTime() + COACH_GRACE_HOURS * 60 * 60 * 1000)
    if (new Date() < graceExpiry) return { locked: false, days, reason: 'coach-unlocked' }
  }
  return { locked: true, days, reason: 'locked' }
}
