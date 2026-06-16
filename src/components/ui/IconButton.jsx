// Borderless icon button — replaces the iconBtnStyle object (↻ ✎ ✕ ⠿ save…).
// `danger` tints it error-red; muted by default.
export default function IconButton({ danger = false, size = 'md', style, children, ...rest }) {
  return (
    <button
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '4px 6px',
        fontSize: size === 'lg' ? 'var(--text-md)' : 'var(--text-sm)',
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        color: danger ? 'var(--color-error)' : 'var(--color-muted)',
        fontFamily: 'inherit',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
