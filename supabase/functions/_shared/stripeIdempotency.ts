// An idempotency key for a Stripe write, so one intention cannot become two
// charges.
//
// THE FAILURE THIS PREVENTS. Stripe performs the work and then sends a
// response. If the response is what goes missing — a dropped connection, a
// function timeout, a coach on a train — the work is already done and nothing
// here knows it. The coach taps again, a second subscription update goes out,
// and they are invoiced twice for one decision. Nothing looks broken anywhere:
// both requests were valid, both succeeded, and the only trace is on their
// card statement. Stripe replays the first response instead when the same key
// arrives again, within 24 hours.
//
// WHY THE KEY COMES FROM THE BROWSER. It has to be stable across a RETRY and
// different across a genuinely new intention, and only the caller knows which
// it is looking at. A key derived server-side from the request contents gets
// that exactly backwards: a coach who switches annual to monthly and back to
// annual in the same day would have the third switch silently replay the
// first and do nothing at all.
//
// A caller-supplied key is safe to accept. The worst it can do is make the
// sender's own second request a no-op, which is the entire point of it. It is
// still validated as a UUID rather than passed through, so it cannot be used
// to collide with another user's key or to smuggle anything into a header.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Builds the header for a Stripe POST. `scope` namespaces the key by operation
// and by user, so the same request id reused across two different endpoints
// cannot make one replay the other.
//
// Returns no header at all when the caller sent nothing usable. That is
// deliberate: a key invented here per call protects nothing (every attempt
// would get a different one) while looking like it does, and a convincing
// no-op is worse than an absence.
export function idempotencyHeader(
  scope: string,
  requestId: unknown,
): Record<string, string> {
  if (typeof requestId !== 'string' || !UUID_RE.test(requestId)) return {}
  return { 'Idempotency-Key': `${scope}:${requestId}` }
}
