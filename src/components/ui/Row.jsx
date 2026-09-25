// Surface level 3 of 3 — a record inside a Panel.
//
// No border, no background, no radius. Rows are separated by a single hairline
// divider and the last one has none. `cols` is a grid-template-columns string;
// without it the row is a simple flex line.
export default function Row({ cols, align = 'center', density = 'compact', className = '', style, children, ...rest }) {
  const pad = density === 'comfortable' ? '18px 24px' : '16px 16px'
  return (
    <div
      // .ds-row owns the divider so the LAST row can drop it — a thing inline
      // styles cannot express.
      className={`ds-row ${className}`.trim()}
      style={{
        display: cols ? 'grid' : 'flex',
        gridTemplateColumns: cols,
        alignItems: align,
        gap: 'var(--space-md)',
        padding: pad,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
