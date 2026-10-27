import { toLocalDateString } from './dateHelpers'

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
//
// OR it was SUBMITTED inside the period (created_at). Moving the check-in day
// moves the period's start: a check-in filed under Sunday Oct 25 sits before a
// Tuesday Oct 27 start, and by its key alone the client would owe another one
// a day or two after sending it. What they sent this period counts.
export function coversPeriod(checkIn, period) {
  if (!checkIn?.week_of || !period?.weekOf) return false
  if (checkIn.week_of >= period.weekOf) return true
  return Boolean(checkIn.created_at) && toLocalDateString(new Date(checkIn.created_at)) >= period.weekOf
}

// A check-in's 1–10 ratings, whichever form it was filed on: the two fixed
// ones of the original form, or every rating question of a custom one (keyed
// by question id, so the same question can be found on the previous check-in).
export function checkinRatings(c) {
  if (!c) return []
  if (Array.isArray(c.answers) && c.answers.length > 0) {
    return c.answers
      .filter(a => a.type === 'rating' && a.value != null && a.value !== '')
      .map(a => ({ id: a.question_id || a.prompt, label: a.prompt, value: Number(a.value) }))
  }
  return [
    c.adherence_rating != null && { id: 'adherence', label: 'Adherence', value: c.adherence_rating },
    c.energy_level != null && { id: 'energy', label: 'Energy', value: c.energy_level },
  ].filter(Boolean)
}
