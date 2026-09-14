// Status / compliance badge — the colored pills with an optional leading dot.
//   tone="soft"   (default) tinted, 35% border — compliance + supporting status
//   tone="strong"           tinted, FULL-opacity border — triage/alert, where the
//                           badge is the primary signal and must out-shout its
//                           neighbours. Added because the roster's triage pill
//                           was hand-rolled at this weight; keeping it in the
//                           system beats an inline override at each call site.
//   tone="solid"            filled — the count badge in SectionHeader
// `color` is any token or CSS color.
export default function Badge({ color = 'var(--color-primary)', tone = 'soft', dot = false, style, children, ...rest }) {
  const solid = tone === 'solid'
  const strong = tone === 'strong'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: solid ? color : `color-mix(in srgb, ${color} 12%, transparent)`,
        color: solid ? 'var(--color-on-accent)' : color,
        border: solid ? 'none' : `1px solid ${strong ? color : `color-mix(in srgb, ${color} 35%, transparent)`}`,
        borderRadius: '999px',
        padding: '3px 10px',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: solid ? 'var(--color-on-accent)' : color }} />}
      {children}
    </span>
  )
}
