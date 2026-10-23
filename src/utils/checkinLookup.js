// Finding a client's check-in, and deciding whether it counts for right now.
//
// These were the same question before, and that was the bug. Every surface
// looked a check-in up by EXACT KEY — `week_of === checkinPeriod(interval).weekOf`
// — which silently made the cadence setting a retroactive index into history.
//
// A client fills their weekly check-in on Thursday Oct 22: the row is stored
// with week_of 2026-10-18, that week's Sunday. The coach switches to biweekly
// on the Friday. Every lookup now asks for week_of 2026-10-11, because that is
// where the two-week block containing Oct 18 begins. Nothing is at that key, so
// the check-in filed the day before stops being found: the card shows an older
// one or an empty state, the roster marks them as not checked in, and the coach
// is prompted to nudge someone who checked in yesterday. The answers were never
// lost. The app stopped looking where they are.
//
// So the two questions are separated:
//
//   latestCheckIn   WHAT to show — the most recent one, whatever period it was
//                   filed under. Cadence has no say in this.
//   coversPeriod    WHETHER one is still owed — does the latest fall INSIDE the
//                   current period? A range test, not a key match, which is why
//                   it survives the cadence changing underneath it. The Oct 18
//                   check-in above is inside the Oct 11-24 biweekly period, so
//                   it still counts, exactly as a coach would expect.
//
// Cadence keeps the one job it was meant to have: saying when the next is due.

// Most recent first. week_of is an ISO date string, so a plain string compare
// orders it correctly and needs no Date parsing.
export function latestCheckIn(rows = []) {
  let best = null
  for (const r of rows) {
    if (!r?.week_of) continue
    if (!best || r.week_of > best.week_of) best = r
  }
  return best
}

// Does this check-in belong to the period we are currently in?
//
// `>=` the period's start, not `===` its key: a check-in filed under a shorter
// cadence sits at a later Sunday than the longer period's start, and it is
// still inside that period. Equality is what broke when the cadence moved.
export function coversPeriod(checkIn, period) {
  if (!checkIn?.week_of || !period?.weekOf) return false
  return checkIn.week_of >= period.weekOf
}
