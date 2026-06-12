// Decide whether — and why — a client is worth nudging. Re-engagement only:
// if there's no concrete reason, returns null and no Nudge button is shown.
// One source of truth for BOTH the button's visibility and the message the
// nudge sends, so they can never disagree.
//
// Priority: gone quiet (no logging) outranks a missing check-in.
export function nudgeReason({ daysSinceLog, hasCheckIn, today = new Date() } = {}) {
  // Gone quiet — hasn't logged in a couple days, or never has.
  if (daysSinceLog === null || (typeof daysSinceLog === 'number' && daysSinceLog >= 2)) {
    return { key: 'log', days: daysSinceLog }
  }
  // Logging fine but no check-in — only naggable later in the week (give them
  // Sun–Wed to do it on their own; getDay() >= 4 is Thu/Fri/Sat).
  if (!hasCheckIn && today.getDay() >= 4) {
    return { key: 'checkin' }
  }
  return null
}
