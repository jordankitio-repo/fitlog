import TargetBar from './TargetBar'
import { Icon } from './ui'
import { cardStyle } from '../utils/styles'

// The day against its targets, at the top of the Today tab, and the way into
// what was logged.
//
// It started on My Progress, where it repeated the Log's own totals one tab
// over: the reader met calories, macros, steps, cardio and weight twice. Now it
// is the Log's summary and the Log's index at once. Each part opens the records
// behind it underneath (Apple Health's summary tile opens its data the same
// way): the macros open the meals, Cardio the workouts, Steps and Weight their
// entries. Trends stay on Progress.
//
// The grouping is F2's: calories, protein, carbs and fat are four parts of ONE
// number and lay out as a block, and the block is ONE control (they all open
// the meals). Cardio, steps and weight are three independent readings, so
// three tiles, one control each.
//
// The cell: label, value, sub, bar. Nothing new invented.

function Cell({ label, color, value, denom, sub, subTone, pct }) {
  return (
    <>
      <span style={{
        fontSize: 'var(--text-xs)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        // Neutral, not the metric hue: metric tokens are FILL colours and fail
        // WCAG as text on the light card (calories 1.62:1, fat 2.20:1). The
        // hue stays on the bar below, where a shape has no contrast floor.
        color: 'var(--color-muted)',
        fontWeight: 'var(--weight-medium)',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <span className="tnum tp-value" style={{
        fontWeight: 'var(--weight-semibold)',
        color: 'var(--color-text)',
        lineHeight: 1.1,
      }}>
        {value}
        {denom && (
          <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 'var(--weight-normal)' }}>
            {denom}
          </span>
        )}
      </span>
      {/* F3: every cell carries a sub -- the target, or its absence. */}
      <span style={{
        fontSize: 'var(--text-xs)', lineHeight: 1.5,
        ...(subTone === 'success'
          ? { color: 'var(--color-success)', fontWeight: 'var(--weight-medium)' }
          : { color: 'var(--color-muted)' }),
      }}>
        {sub}
      </span>
      {pct != null && (
        <span style={{ display: 'block', marginTop: 'var(--space-2)' }}>
          <TargetBar pct={pct} color={color} />
        </span>
      )}
    </>
  )
}

// One reading as a tile of its own, the way Apple Fitness's Summary sets out
// Sessions and Trainer Tips: a titled box with a chevron, the number large
// beneath, the target and its bar at the foot. The number stays neutral (B2:
// a metric hue fails as text); the hue is the bar's.
function Tile({ label, color, value, denom, sub, subTone, pct, ...rest }) {
  return (
    <button {...rest} className="tp-tile ds-control">
      <span className="tp-tile-head">
        <span className="tp-tile-title">{label}</span>
        <span className="tp-tile-chev" aria-hidden="true"><Icon name="right" size={14} strokeWidth={2.5} /></span>
      </span>
      <span className="tnum tp-value" style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)', lineHeight: 1.1 }}>
        {value}
        {denom && (
          <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 'var(--weight-normal)' }}>{denom}</span>
        )}
      </span>
      <span className="tp-tile-foot">
        <span style={{
          fontSize: 'var(--text-xs)', lineHeight: 1.5,
          ...(subTone === 'success'
            ? { color: 'var(--color-success)', fontWeight: 'var(--weight-medium)' }
            : { color: 'var(--color-muted)' }),
        }}>{sub}</span>
        {pct != null && <TargetBar pct={pct} color={color} />}
      </span>
    </button>
  )
}

// `open` is the part whose records show below ('food', 'cardio', 'steps',
// 'weight' or null); `onSelect(key)` toggles it. `controls` maps a key to the
// id of the section it opens, for aria-controls.
export default function TodayPanel({ macros = [], activity = [], open, onSelect, controls = {} }) {
  const hit = (key) => ({
    type: 'button',
    'aria-expanded': open === key,
    'aria-controls': controls[key],
    onClick: () => onSelect(key),
  })
  return (
    <>
      {/* Four parts of one number: one card, no dividers, one button. */}
      {macros.length > 0 && (
        <div className="tp-panel" style={cardStyle}>
          <button
            {...hit('food')}
            aria-label={`Nutrition: ${macros.map(m => `${m.label} ${m.value} ${m.sub}`).join(', ')}`}
            className={`tp-hit ds-control tp-macros${macros.length === 3 ? ' is-three' : ''}`}
          >
            {macros.map(({ key, ...m }) => <span key={key} className="tp-cell"><Cell {...m} /></span>)}
          </button>
        </div>
      )}
      {/* Three independent readings: three tiles. */}
      {activity.length > 0 && (
        <div className="tp-tiles">
          {activity.map(({ key, ...m }) => <Tile key={key} {...hit(key)} {...m} />)}
        </div>
      )}
    </>
  )
}
