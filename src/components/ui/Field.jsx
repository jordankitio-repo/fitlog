// Form control primitives. <Field> renders an input (or textarea/select via
// `as`), optionally wrapped with a label + error. Textarea/Select are thin
// presets. The shared style object lives in ./controlStyle.js.
import { controlStyle } from './controlStyle'

export function Field({ as = 'input', label, error, style, children, ...rest }) {
  const Tag = as
  // A number input draws its own spinner at the padding edge, like a select's
  // arrow — the control's uniform 12px leaves it wedged against the border.
  const arrowRoom = rest.type === 'number' ? { paddingRight: 'var(--space-20)' } : null
  const control = (
    <Tag
      style={{ ...controlStyle, ...arrowRoom, ...(error ? { borderColor: 'var(--color-error)' } : {}), ...style }}
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

// A native <select> draws its own arrow hard against the padding edge, so the
// control's uniform 12px leaves the chevron looking wedged into the border.
// Extra right padding is the only thing that moves it inward.
export function Select({ style, ...props }) {
  return <Field as="select" style={{ paddingRight: 'var(--space-20)', ...style }} {...props} />
}
