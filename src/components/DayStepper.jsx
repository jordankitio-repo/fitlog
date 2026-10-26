import Button from './Button'
import { Icon } from './ui'
import { parseLocalDateString, toLocalDateString } from '../utils/dateHelpers'

// `‹ Today ›` -- the one day control, on every page that picks a day.
//
// It was the Log's header, and My Progress and the coach's client record each
// had their own: arrows around a full native date field ("Oct 25, 2026") plus
// a separate Today button. Three versions of one control, and the reader had
// to learn two of them. This is the Log's, unchanged, so they can no longer
// drift.
//
// The middle names the day ("Today" until it moves, then "Oct 22", short month
// so a phone header holds one line) and opens the calendar. There is no
// separate Today button: the calendar, or `›`, is the way back.
//
// The middle is a Button with the native date input laid over it, invisible:
// tapping a real date input is what reliably opens the picker in a WKWebView,
// where showPicker() is not something to lean on.
export default function DayStepper({ value, onChange }) {
  const today = toLocalDateString(new Date())
  const isToday = value === today
  const step = (days) => {
    const d = parseLocalDateString(value)
    d.setDate(d.getDate() + days)
    onChange(toLocalDateString(d))
  }
  const label = isToday
    ? 'Today'
    : parseLocalDateString(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)', flexShrink: 0 }}>
      <Button onClick={() => step(-1)} variant="muted" size="sm" ariaLabel="Previous day"><Icon name="left" /></Button>
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <Button variant="muted" size="sm" tabIndex={-1} aria-hidden="true" style={{ minWidth: 76 }}>{label}</Button>
        <input
          type="date"
          aria-label={`Pick a day, showing ${label}`}
          value={value}
          max={today}
          onChange={(e) => { if (e.target.value) onChange(e.target.value) }}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
        />
      </span>
      <Button onClick={() => step(1)} disabled={isToday} variant="muted" size="sm" ariaLabel="Next day"><Icon name="right" /></Button>
    </div>
  )
}
