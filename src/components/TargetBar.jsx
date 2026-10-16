// A progress track whose target is a MARK on it, not its end.
//
// The problem this replaces: the old "Today vs target" bar filled to
// `Math.min(pct, 100)`, so every metric at or past target rendered as an
// identical full-width stripe. On a real client's day four of six rows were
// over target, and the panel read as six solid bars of different hues — the
// numbers beside them carried the entire signal and the bars carried none.
// A chart where the most common state is indistinguishable from every other
// instance of it is decoration.
//
// So the target sits at TARGET_AT of the track and the rest is headroom: under
// target reads short of the notch, over target reads past it, and at target
// lands on it. Six rows now have six distinguishable shapes.
//
// Still NOT graded, for the reason B3 gives and the old code's comment already
// stated: over-target means opposite things per metric (over on steps is the
// win, over on calories is the miss) and `targets` carries no per-metric
// direction to derive a tone from. The bar says how far, never how well. What
// carries past the notch is the SAME hue at lower opacity — a quantity, not a
// verdict.

// The notch position. 0.8 leaves a quarter again of headroom past target
// (125% of target reaches the end of the track), which covers the overshoot
// range these metrics actually produce; beyond that the fill pins at the end
// and the number beside it carries the rest.
const TARGET_AT = 0.8
const MAX_PCT = 100 / TARGET_AT // 125

export default function TargetBar({ pct, color }) {
  const clamped = Math.max(0, Math.min(pct, MAX_PCT))
  const fill = clamped * TARGET_AT // → % of the track
  const upToTarget = Math.min(fill, TARGET_AT * 100)
  const past = Math.max(0, fill - TARGET_AT * 100)

  return (
    <div
      // The bar restates a number that is already written beside it, so it is
      // presentation rather than content — the row's own text is what a screen
      // reader should read. aria-hidden stops it being announced twice.
      aria-hidden="true"
      style={{
        position: 'relative',
        height: '6px',
        backgroundColor: 'var(--color-border)',
        // A progress track is a PILL, not a surface — the one radius rule this
        // shape has. It was reinvented as 3px (half of 6) per call site before.
        borderRadius: '999px',
        overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute', inset: '0 auto 0 0',
        width: `${upToTarget}%`,
        backgroundColor: color,
        borderRadius: '999px',
        transition: 'width 0.3s ease',
      }} />
      {past > 0 && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${TARGET_AT * 100}%`,
          width: `${past}%`,
          backgroundColor: color,
          opacity: 0.4,
          borderRadius: '999px',
          transition: 'width 0.3s ease',
        }} />
      )}
      {/* The notch. Painted in the PANEL's colour rather than a border token so
          it reads as a gap cut through the fill, which is legible whether the
          fill has reached it or not — a hairline in --color-border vanishes
          against the empty track. */}
      <div style={{
        position: 'absolute', top: '-1px', bottom: '-1px',
        left: `${TARGET_AT * 100}%`,
        width: '2px',
        backgroundColor: 'var(--color-surface)',
      }} />
    </div>
  )
}
