// The send/don't-send gate for the emails a user is allowed to switch off.
//
// Every sender calls `wantsEmail` instead of reading `notification_preferences`
// itself. Six copies of "fetch the row, read the map, decide what a missing key
// means" is six chances to disagree about it, and they would disagree silently,
// in the direction of sending mail somebody asked us not to send. The decision
// itself lives one level further down still, in the `wants_email_notification`
// SQL function — this is the one caller of it.
//
// What is NOT here is as deliberate as what is. An invite, a coaching
// connection ending (either side), a check-in cadence change, and every
// account, security and billing notice are always-on and have no category: they
// announce a change to the relationship or the account rather than activity
// within it. The categories below are an allow-list of what can be switched
// off, so a new email nobody thought about is not silenceable by accident.

// Keep in sync with the check constraint in
// 20261019100000_notification_preferences.sql and with
// src/utils/notificationCategories.js, which labels these for the screen.
// The DB constraint is the backstop: an unknown key cannot be stored, so a
// typo here fails on write rather than quietly muting nothing.
export type EmailCategory =
  | 'report'          // client: a new coaching report from their coach
  | 'checkin_review'  // client: their coach reviewed their check-in
  | 'nudge'           // client: their coach asked them to log / check in
  | 'client_checkin'  // coach:  a client submitted a check-in
  | 'milestone'       // coach:  a client hit a streak milestone
  | 'weekly_digest'   // coach:  the weekly roster digest

// True if this user should receive this email.
//
// Fails OPEN: a lookup that errors sends the mail. Every category above is mail
// about a service the user is actively enrolled in, and losing a coach's
// check-in notice to a transient REST error is worse than one unwanted email.
// Marketing mail would have to fail CLOSED and so cannot use this function as
// written — that is a new helper, not an extra argument to this one.
export async function wantsEmail(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  category: EmailCategory,
): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/wants_email_notification`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_user_id: userId, p_category: category }),
    })
    if (!res.ok) {
      console.error(`wants_email_notification(${category}) -> ${res.status}; sending anyway`)
      return true
    }
    return (await res.json()) !== false
  } catch (err) {
    console.error(`wants_email_notification(${category}) threw; sending anyway:`, err)
    return true
  }
}
