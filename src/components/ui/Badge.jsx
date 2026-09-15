// Status / compliance badge.
//
// NO LEADING DOT. "Tinted pill with a coloured dot in it" is a rejected pattern
// on this project — it reads as generic AI dashboard, and the dot never carried
// information the label didn't already state. Do not add it back.
//   tone="soft"   (default) tinted, 35% border — compliance + supporting status
//   tone="strong"           tinted, FULL-opacity border — triage/alert, where the
//                           badge is the primary signal and must out-shout its
//                           neighbours. Added because the roster's triage pill
//                           was hand-rolled at this weight; keeping it in the
//                           system beats an inline override at each call site.
//   tone="solid"            filled — the count badge in SectionHeader
// `color` is any token or CSS color.
export default function Badge({ color = 'var(--color-primary)', tone = 'soft', style, children, ...rest }) {
  const solid = tone === 'solid'
  const strong = tone === 'strong'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-6)',
        background: solid ? color : `color-mix(in srgb, ${color} 12%, transparent)`,
        color: solid ? 'var(--color-on-accent)' : color,
        border: solid ? 'none' : `1px solid ${strong ? color : `color-mix(in srgb, ${color} 35%, transparent)`}`,
        borderRadius: '999px',
        padding: 'var(--space-4) var(--space-10)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-medium)',
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  )
}
