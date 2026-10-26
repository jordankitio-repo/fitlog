// The emails a user can switch off, and what to call them on the screen.
//
// Keep the keys in sync with two other places, both of which will catch a
// mismatch rather than absorb it:
//   - the check constraint in 20261019100000_notification_preferences.sql,
//     which refuses to store a key that is not on its list
//   - `EmailCategory` in supabase/functions/_shared/notifications.ts, the type
//     the senders pass
// `notificationCategories.test.js` asserts this list against that constraint's
// list, so a key added in one place and forgotten in another fails a test
// instead of quietly muting nothing.
//
// EMAIL ONLY, deliberately. The in-app bell stays on: it is pull-not-push, it
// derives most of its entries live from messages/check_ins/reports, and email
// is the channel that both intrudes and is regulated.
//
// What is absent is the other half of the design. An invite, a coaching
// connection ending (either side), a cadence change, and every account,
// security and billing notice have no category and cannot be switched off:
// they announce a change to the relationship or the account rather than
// activity within it. This list is an allow-list of what is switchable, so an
// email nobody thought about is not silenceable by accident.
export const EMAIL_CATEGORIES = [
  {
    key: 'report',
    role: 'client',
    label: 'New coaching reports',
    description: 'When your coach sends you a weekly report.',
  },
  {
    key: 'checkin_review',
    role: 'client',
    label: 'Check-in reviews',
    description: 'When your coach reviews a check-in you submitted.',
  },
  {
    key: 'nudge',
    role: 'client',
    label: 'Reminders from your coach',
    // No "you'll still see it in the app": the panel says that once, for
    // every email, under its heading.
    description: 'When your coach asks you to log a day or check in.',
  },
  {
    key: 'client_checkin',
    role: 'coach',
    label: 'Client check-ins',
    description: 'When one of your clients submits a check-in.',
  },
  {
    key: 'milestone',
    role: 'coach',
    label: 'Client milestones',
    description: 'When a client hits a logging streak worth knowing about.',
  },
  {
    key: 'weekly_digest',
    role: 'coach',
    label: 'Weekly digest',
    description: 'Your Monday summary of how the whole roster did last week.',
  },
]

// Solo users receive none of these: every one needs a coach on the other end.
// The panel does not render for them rather than showing an empty card.
export function categoriesForRole(role) {
  return EMAIL_CATEGORIES.filter((c) => c.role === role)
}

// Absent key = send. The stored map only ever records departures from the
// default, which is what lets a user who has never opened this screen have no
// row at all. Mirrors `wants_email_notification` in SQL; if these two ever
// disagree, the SQL one is the truth, because it is what actually gates a send.
export function isEnabled(prefs, key) {
  return prefs?.[key] !== false
}
