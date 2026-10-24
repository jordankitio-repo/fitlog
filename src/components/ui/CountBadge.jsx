// The app's one count bubble: a small filled circle that sits ON the thing it
// counts, overlapping its corner.
//
// Extracted from the notification bell, which carried it as an inline style,
// when the client's Coach tab needed the same mark. Two hand-rolled copies of a
// 16px circle with a 2px ring would have drifted the first time either moved.
//
// NOT ui/Badge. That one is an inline-flow pill for a LABEL ("Unread", a
// compliance tone) and sits in the layout. This is absolutely positioned,
// overlaps its anchor, and carries a number.
//
// The caller must be `position: relative`. It deliberately sits PAST the
// corner: at top/right 0 a two-character "9+" covered the upper half of the
// glyph underneath and read as clipped rather than badged.
//
// aria-hidden, always. A bare number read aloud between a label and its control
// is noise; every caller announces the count in its own aria-label, where it
// can say what the count is OF.
export default function CountBadge({ count, max = 9, style }) {
  if (!count) return null
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute', top: '-2px', right: '-2px',
        minWidth: 16, height: 16, padding: '0 var(--space-4)', boxSizing: 'border-box',
        borderRadius: '999px', background: 'var(--color-error)', color: 'var(--color-on-accent)',
        fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', lineHeight: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // Reads as a separate object sitting on the bar, not part of the glyph.
        border: '2px solid var(--color-surface)',
        pointerEvents: 'none',
        ...style,
      }}
    >{count > max ? `${max}+` : count}</span>
  )
}
