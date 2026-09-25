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
