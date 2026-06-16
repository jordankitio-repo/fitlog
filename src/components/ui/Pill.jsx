// Selectable pill/chip button — replaces the pillBtnStyle object and the ad-hoc
// slot/sort/cadence chips. `active` flips it to the filled primary state.
export default function Pill({ active = false, style, children, ...rest }) {
  return (
    <button
      style={{
        background: active ? 'var(--color-primary)' : 'var(--color-surface)',
        color: active ? 'var(--color-on-accent)' : 'var(--color-text)',
        border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
        borderRadius: '999px',
        padding: '5px 12px',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
