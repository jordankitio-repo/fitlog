import { toLocalDateString } from './dateHelpers'

// Pausing a client (coach_clients.paused_until): the bits both the roster and
// the client record format the same way.

// "Nov 3" for a YYYY-MM-DD, read as a local date.
export const shortDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

// A week from today: the default end of a pause.
export function defaultPauseEnd() {
  const d = new Date(); d.setDate(d.getDate() + 7)
  return toLocalDateString(d)
}

