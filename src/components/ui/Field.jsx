// Form control primitives — replace the inputStyle object duplicated across 9
// files. <Field> renders an input (or textarea/select via `as`), optionally
// wrapped with a label + error. Textarea/Select are thin presets.
const controlStyle = {
  backgroundColor: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)',
  padding: '10px 12px',
  color: 'var(--color-text)',
  fontSize: 'var(--text-base)',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
}

export function Field({ as = 'input', label, error, style, children, ...rest }) {
  const Tag = as
  const control = (
    <Tag
      style={{ ...controlStyle, ...(error ? { borderColor: 'var(--color-error)' } : {}), ...style }}
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
export function Select(props) { return <Field as="select" {...props} /> }
