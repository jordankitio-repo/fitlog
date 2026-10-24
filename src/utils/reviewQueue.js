// Who still owes the coach a review, and in what order.
//
// ONE rule, two callers. The roster banner derives this from the stats it has
// already loaded; a client record has to ask the database for it. If each spelt
// the rule out for itself they would disagree the first time it changed — which
// is exactly how `week_of === period.weekOf` ended up in three places and
// orphaned a client's check-in when the cadence moved (see checkinLookup.js).
//
// "Waiting" is a property of the client's LATEST check-in, not of any older one:
// a coach who reviewed this week's submission is done, whatever sits behind it.
// That matches what the card shows, so the count and the page can never
// contradict each other.
//
// Oldest submission first. A queue that hands back the newest leaves the person
// who has waited longest waiting longer, which is the opposite of triage.

// `latestByClient` maps a client id to that client's most recent check-in row
// (or null). Returns the ids that still need a review, oldest submission first.
export function waitingFrom(latestByClient = {}) {
  return Object.entries(latestByClient)
    .filter(([, ci]) => ci && !ci.reviewed_at)
    .sort((a, b) => String(a[1].created_at || '').localeCompare(String(b[1].created_at || '')))
    .map(([id]) => id)
}

// Reduce raw check-in rows to one per client — the most recent. week_of is an
// ISO date string, so a string compare orders it without parsing.
export function latestPerClient(rows = []) {
  const out = {}
  for (const r of rows) {
    if (!r?.client_id || !r?.week_of) continue
    const held = out[r.client_id]
    if (!held || r.week_of > held.week_of) out[r.client_id] = r
  }
  return out
}
