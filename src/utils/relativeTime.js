// "2 days ago" for correspondence timestamps.
//
// A report is a message from a person, and a message is dated the way people
// date one: recency first, absolute date only once recency stops meaning
// anything. "Sent Sep 16, 10:07 PM" made a coach's note read like a log line —
// it is precise about the thing the reader cares least about.
//
// Crosses over to an absolute date at a week, because past that "23 days ago"
// is arithmetic the reader has to do rather than information.
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export function relativeTime(iso, now = new Date()) {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const diff = now.getTime() - then.getTime()

  if (diff < MIN) return 'just now'
  if (diff < HOUR) {
    const m = Math.floor(diff / MIN)
    return `${m} minute${m === 1 ? '' : 's'} ago`
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR)
    return `${h} hour${h === 1 ? '' : 's'} ago`
  }

  // Calendar days, not 24-hour blocks: something sent at 11pm last night is
  // "yesterday" at 8am, not "9 hours ago".
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const b = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const days = Math.round((a - b) / DAY)

  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`

  const sameYear = then.getFullYear() === now.getFullYear()
  return then.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

// The full timestamp, for the `title`-free tooltip-less case: shown beside the
// relative one when a reader needs the exact moment.
export function exactTime(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// The label on a thread's day separator.
//
// The DAY only, with no clock time. Messages.app pairs the two because a phone
// chat arrives in bursts and the hour tells you whether two messages were one
// conversation or two. A coaching thread is one or two items a day, so the
// separator is per-day and the time it would print is just whenever the first
// of them happened: precision that is not information. It read as noise the
// moment it was on screen, where every row said "11:32 PM".
export function dayStamp(iso, now = new Date()) {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''

  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const b = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const days = Math.round((a - b) / DAY)

  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  // Inside the week the weekday is more locating than the date: "Monday" is a
  // day you remember, "Sep 15" is one you work out.
  if (days < 7) return then.toLocaleDateString(undefined, { weekday: 'long' })

  const sameYear = then.getFullYear() === now.getFullYear()
  return then.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }),
  })
}
