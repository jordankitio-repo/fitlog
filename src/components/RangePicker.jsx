import Pill from './ui/Pill'
import { RANGES } from '../utils/chartRange'

// W / M / Y for the Trends card.
//
// It lived inside the chart disclosure, which put it below the sentences it
// governs and hid it entirely until a row was opened — a control that steers
// the whole card should not be reachable only by opening part of it. In the
// panel header it is visible from the first glance, and its scope is obvious:
// everything under this heading reads over the window it names.
//
// A pill you can press keeps the capsule, because there the shape IS the
// affordance — the rule that bans the shape is about status, which is not a
// control. `Pill` is a Button, so hover, press and height come from the
// control system rather than from a second implementation of it.
export default function RangePicker({ value, onChange }) {
  return (
    <div className="trend-ranges" role="group" aria-label="Trend window">
      {RANGES.map((r) => (
        <Pill
          key={r.key}
          type="button"
          active={r.key === value}
          aria-pressed={r.key === value}
          ariaLabel={r.name}
          onClick={() => onChange(r.key)}
        >
          {r.label}
        </Pill>
      ))}
    </div>
  )
}
