// A small graph in a card's corner, Apple Health's pinned-card preview: the
// last few readings as dots on a thin line, the newest in `color` and the rest
// grey. Decorative (aria-hidden): the card's own number and words say the same.
//
// Scaled to `domain` [lo, hi] when given (a 1-10 rating always reads on its
// whole scale), otherwise to the data's own range but never narrower than
// `minSpan`, centred: scaled to its own range alone, a week of 86.1-86.3 kg
// filled the whole height and day-to-day water read as a zigzag of real change.
export default function Sparkline({ points, minSpan = 1, domain = null, color = 'var(--color-weight)', width = 72, height = 30 }) {
  const R = 2.5
  const lo = domain ? domain[0] : Math.min(...points)
  const hi = domain ? domain[1] : Math.max(...points)
  const span = domain ? (hi - lo || 1) : Math.max(hi - lo, minSpan)
  const top = domain ? hi : (hi + lo) / 2 + span / 2
  const xy = points.map((v, i) => [
    R + (i * (width - 2 * R)) / Math.max(1, points.length - 1),
    R + ((top - v) * (height - 2 * R)) / span,
  ])
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <polyline points={xy.map(p => p.join(',')).join(' ')} fill="none" stroke="var(--color-border)" strokeWidth="1.5" strokeLinejoin="round" />
      {xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === xy.length - 1 ? R + 0.5 : R}
          fill={i === xy.length - 1 ? color : 'var(--color-faint)'} />
      ))}
    </svg>
  )
}
