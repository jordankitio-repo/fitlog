// User-facing copy for a failed invite acceptance.
//
// The accept is one atomic RPC (accept_invitation) that raises a short symbolic
// message, and it has TWO callers: the `redeem-invite` edge function (brand-new
// account) and the browser directly (invitee who already had an account and has
// just signed in by OTP). Both surface errors on the same Join screen, so the
// mapping lives here rather than being written twice with drifting wording.
// `redeem-invite` maps the same symbols server-side — keep the two in step.

export const DEAD_INVITE = 'This invite link is invalid or has already been used.'

const MESSAGES = [
  ['invite_not_found', DEAD_INVITE],
  ['invite_already_used', DEAD_INVITE],
  ['invite_expired', 'This invite link has expired. Ask your coach to send a new one.'],
  ['invite_email_mismatch', 'This invite was sent to a different email address.'],
  ['coach_cannot_accept', 'This email belongs to a coach account and cannot accept a client invite.'],
  ['already_coached', 'You are already connected to a coach.'],
  ['not_authenticated', 'Your session expired. Reopen the invite link to try again.'],
]

// `raw` is a Postgres error message (browser path) or an already-mapped string
// from the edge function (which returns finished copy, so it passes through).
export function inviteErrorMessage(raw) {
  const text = String(raw ?? '')
  for (const [symbol, message] of MESSAGES) {
    if (text.includes(symbol)) return message
  }
  return text || 'Could not accept this invite. Please try again.'
}
