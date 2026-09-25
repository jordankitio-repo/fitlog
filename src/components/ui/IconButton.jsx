// Borderless icon button — replaces the iconBtnStyle object (↻ ✎ ✕ ⠿ save…).
//
// D3 rank 4: no chrome until hover. The hover and press live in `.ds-iconbtn`
// (index.css), not here, for the reason D2 gives — a control that styles its
// own interaction must carry `ds-control` or the blanket `button:hover`
// fallback silently overwrites it, which is exactly what was happening to this
// primitive. `danger` tints it error-red; muted by default.
export default function IconButton({ danger = false, size = 'md', className = '', style, children, ...rest }) {
  return (
    <button
      className={`ds-iconbtn ds-control ${danger ? 'ds-iconbtn-danger' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 'var(--space-4) var(--space-6)',
        fontSize: size === 'lg' ? 'var(--text-md)' : 'var(--text-sm)',
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: 'inherit',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
