// Form control primitives. <Field> renders an input (or textarea/select via
// `as`), optionally wrapped with a label + error. Textarea/Select are thin
// presets. The shared style object lives in ./controlStyle.js.
import { controlStyle } from './controlStyle'
import WheelSelect from '../WheelSelect'

export function Field({ as = 'input', label, error, style, children, ...rest }) {
  // A select is a WheelSelect: the native menu on a computer, the iOS-style
  // wheel on a phone. It is told its label so the wheel's sheet can name it.
  const Tag = as === 'select' ? WheelSelect : as
  if (as === 'select' && label) rest = { ...rest, label }
  // A number input draws its own spinner at the padding edge, like a select's
  // arrow — the control's uniform 12px leaves it wedged against the border.
  // Whole shorthands, never a longhand on top of controlStyle's shorthand: React
  // re-applies the shorthand on an update and silently drops the longhand (it
  // warns "conflicting property"), which left an error border stuck or gone.
  const arrowRoom = rest.type === 'number' ? { padding: '10px var(--space-20) 10px 12px' } : null
  const control = (
    <Tag
      style={{ ...controlStyle, ...arrowRoom, ...(error ? { border: '1px solid var(--color-error)' } : {}), ...style }}
      {...rest}
    >
      {children}
    </Tag>
  )
  if (!label && !error) return control
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
      {label}
      {control}
      {error && <span style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)' }}>{error}</span>}
    </label>
  )
}

export function Textarea(props) { return <Field as="textarea" {...props} /> }

// The chevron and its clearance are handled for EVERY select in index.css —
// see the `select` rule there — so this stays a thin preset.
export function Select(props) { return <Field as="select" {...props} /> }
