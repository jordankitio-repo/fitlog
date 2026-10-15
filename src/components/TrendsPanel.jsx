import { useState } from 'react'
import Icon from './ui/Icon'

// The question the page never answered: which way am I going?
//
// My Progress showed today's numbers and then three full-width 30-day bar
// charts — calories, cardio, steps — plus a weight line chart. Four panels,
// ~2,400px, and all four left the comparison to the reader. Thirty bars are a
// picture of a series, not a statement about it.
//
// This is the Apple Trends card: one row per metric, each saying your average
// now and which way it moved against your own recent past. The chart is still
// there, as the row's disclosure, because the shape is worth having when you
// want it and is not worth 800px when you don't.
//
// NOT graded, and the arrow's colour is the METRIC's, never a status tone.
// B3 wants a stated rule before any colour: direction is a fact, not a verdict
// — up on steps is the win, up on calories may be the miss, and `targets`
// carries no per-metric direction to derive a tone from. That is the same
// reasoning that keeps the Today percentage ungraded. Apple's own trend arrows
// are per-metric colours for the same reason, not red/green judgements.
//
// One row open at a time, not an accordion-all: two 800px charts open together
// is the page this replaced.

// The chevrons the set already has, plus `flat` for holding steady. A trend
// mark is not a second arrow style (rejected pattern 3) — it is the same
// chevron in a coloured circle, which is what separates it from the collapse
// chevron on a section header. The two never appear in the same role.
const DIRECTION_GLYPH = { up: 'up', down: 'down', flat: 'flat' }

function TrendRow({ metric, open, onToggle }) {
  const { key, label, color, display, sub, trend, chart } = metric
  const dir = trend?.direction
  const glyph = DIRECTION_GLYPH[dir]

  return (
    <div className="ds-row trend-row">
      <button
        type="button"
        className="ds-control trend-rowbtn"
        aria-expanded={open}
        aria-controls={`trend-chart-${key}`}
        onClick={onToggle}
      >
        {/* The direction mark. A circle carrying the metric's hue at low
            opacity with the arrow at full — the mark Apple uses, and the one
            place on this row colour appears, so the eye finds the column. */}
        <span className="trend-mark" style={{ color }} aria-hidden="true">
          <Icon name={glyph || 'flat'} size={16} />
        </span>

        <span className="trend-text">
          <span className="trend-label">{label}</span>
          {/* F3: a row in a column of values always carries one — the average,
              or the reason there isn't one. Never a blank. */}
          <span className="trend-sub">{sub}</span>
        </span>

        <span className="tnum trend-value">{display}</span>

        {/* D3: a navigable row gets a direction cue, and D4 says there is one
            forward mark. Rotated to point down when the row is open, the same
            way SectionHeader does it. */}
        <Icon
          name="right"
          size="14px"
          style={{
            color: 'var(--color-muted)',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 180ms ease',
            flexShrink: 0,
          }}
        />
      </button>
      {open && chart && (
        <div id={`trend-chart-${key}`} className="trend-chart">
          {chart}
        </div>
      )}
    </div>
  )
}

export default function TrendsPanel({ metrics = [], windowDays = 14 }) {
  const [openKey, setOpenKey] = useState(null)

  if (metrics.length === 0) return null

  return (
    <>
      {/* C4: a tracker needs its axis named. The rows hold no mark of their own
          — they are text — but the number in them is an average over a window,
          and a reader cannot interpret "2,340" without knowing over what. Said
          once, at panel level, rather than on every row. */}
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: '0 0 var(--space-4)' }}>
        Your last {windowDays} days against the {windowDays} before. Averaged over the days you logged.
      </p>
      <div className="trend-rows">
        {metrics.map((m) => (
          <TrendRow
            key={m.key}
            metric={m}
            open={openKey === m.key}
            onToggle={() => setOpenKey(openKey === m.key ? null : m.key)}
          />
        ))}
      </div>
    </>
  )
}
