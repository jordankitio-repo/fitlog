import { cardStyle } from '../utils/styles'

function StatCard({ label, value, sub }) {
  return (
    <div
      className="stat-card"
      style={{
        ...cardStyle,
        padding: 'var(--space-16) var(--space-20)',
        minHeight: '80px',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      {/* C1: no legend dot — it only repeated what the label already said, and
          a grid of them reads as a chart legend that has lost its chart.
          The colour does NOT move onto the number. Metric tokens are dark-first
          DATA colours (the light theme flips only the neutral ramp and primary,
          so the accents carry over unchanged); they clear AA on a dark card and
          fail it on a light one at every metric — measured on this component:
          calories 1.62:1, weight 1.87:1, fat 2.20:1, protein 2.69:1,
          carbs 2.85:1, against 4.5:1. A 7px dot had no contrast requirement
          because it is a shape; a numeral does. The label names the metric, so
          the colour was carrying nothing the reader needed. */}
      <p style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--color-muted)',
        fontWeight: 'var(--weight-medium)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        margin: 0
      }}>
        {label}
      </p>
      <p className="stat-card-value" style={{
        fontSize: 'var(--text-xl)',
        fontWeight: 'var(--weight-semibold)',
        color: 'var(--color-text)',
        lineHeight: 1.1,
        margin: 0
      }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', margin: 0 }}>{sub}</p>
      )}
    </div>
  )
}

export default StatCard