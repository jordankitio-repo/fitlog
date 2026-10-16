import { useState } from 'react'
import Icon from './ui/Icon'
import Pill from './ui/Pill'
import { RANGES, DEFAULT_RANGE, rangeByKey } from '../utils/chartRange'

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

function TrendRow({ metric, open, onToggle, range, onRange }) {
  const { key, label, color, display, sub, trend, chart } = metric
  const dir = trend?.direction
  const glyph = DIRECTION_GLYPH[dir]

  return (
    // NOT `ds-row`: that class exists to draw the hairline between records in
    // a Panel, and these rows carry no rule. Borrowing it for the layout alone
    // is how the dividers survived being deleted from .trend-row.
    <div className="trend-row">
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
          {/* W / M / Y. A pill you can PRESS keeps the capsule, because there
              the shape is the affordance — the rule that bans the shape for
              status, which is not a control. `Pill` is a Button, so the hover,
              press and height come from the control system rather than from a
              second implementation of it.

              One range for the whole panel, not one per row: only a single
              chart is open at a time, and a reader who sets the year view and
              then opens a different metric means to stay in the year view. */}
          <div className="trend-ranges" role="group" aria-label="Chart range">
            {RANGES.map((r) => (
              <Pill
                key={r.key}
                type="button"
                active={r.key === range}
                aria-pressed={r.key === range}
                ariaLabel={r.name}
                onClick={() => onRange(r.key)}
              >
                {r.label}
              </Pill>
            ))}
            <span className="trend-range-name">{rangeByKey(range).name}</span>
          </div>
          {chart(range)}
        </div>
      )}
    </div>
  )
}

// The window used to be a standing paragraph above the rows. It moved into an
// InfoTip on the panel's own title (F12: the label is the trigger), because
// every row already names the window in its own sub-line — "vs previous 14
// days", "14-day average" — so the sentence was restating at panel level what
// four rows each carried. What it holds that nothing else shows is the METHOD:
// that the average is taken over the days you logged rather than over the
// calendar. That is D5's test for the bubble, and it is the only part of that
// sentence which earned a permanent line.
export default function TrendsPanel({ metrics = [] }) {
  const [openKey, setOpenKey] = useState(null)
  const [range, setRange] = useState(DEFAULT_RANGE)

  if (metrics.length === 0) return null

  return (
    <div className="trend-rows">
      {metrics.map((m) => (
        <TrendRow
          key={m.key}
          metric={m}
          open={openKey === m.key}
          onToggle={() => setOpenKey(openKey === m.key ? null : m.key)}
          range={range}
          onRange={setRange}
        />
      ))}
    </div>
  )
}
