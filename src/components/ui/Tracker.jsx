// Status shape 3 of 3 — anything over time.
//
// Seven cells for seven days, oldest on the left. Replaces the four separate
// "Calories 2/7 · Protein 2/7" pills the roster used to carry: same width as a
// single pill, and it says WHICH days were missed rather than only how many.
//
// States: 'on' hit the target · 'part' logged but short · 'none' nothing logged.
const TITLE = { on: 'on target', part: 'logged, under target', none: 'nothing logged' }

const TONE = {
  on:   'var(--color-success)',
  part: 'var(--color-warning)',
  none: 'var(--color-border-strong)',
}

export default function Tracker({ days = [], label, dayTitles = [], cell = 11, gap = 3, style, ...rest }) {
  return (
    <span
      role="img"
      aria-label={label || `${days.filter(d => d === 'on').length} of ${days.length} days on target`}
      title={label}
      style={{ display: 'inline-flex', gap, alignItems: 'center', ...style }}
      {...rest}
    >
      {days.map((d, i) => (
        <span
          key={i}
          aria-hidden="true"
          title={dayTitles[i] ? `${dayTitles[i]}: ${TITLE[d] || 'nothing logged'}` : undefined}
          style={{
            width: cell, height: Math.round(cell * 1.45), borderRadius: 2,
            background: TONE[d] || TONE.none, display: 'block', flexShrink: 0,
          }}
        />
      ))}
    </span>
  )
}
