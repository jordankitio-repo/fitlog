import { cardStyle } from '../utils/styles'

function StatCard({ label, value, sub, color }) {
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
      {/* C1: still no legend dot — it only repeated what the label already said,
          and a grid of them reads as a chart legend that has lost its chart.
          The metric colour IS back on the label, and the reason it can be is
          that the ramp was fixed rather than worked around. It used to be
          dark-first only: on a light card every metric failed AA as text
          (calories 1.62:1, weight 1.87:1, fat 2.20:1), so the honest move then
          was to drop the colour. index.css now carries a light 700 step per
          metric, measured at 4.79–6.91:1, so the colour can do its job again.
          It sits on the LABEL, not the numeral: the label is what names the
          metric, and the value stays in text ink so a column of numbers reads
          as one column (the dataviz rule — text never wears the data colour;
          a coloured mark beside it carries identity). */}
      <p style={{
        fontSize: 'var(--text-xs)',
        color: color || 'var(--color-muted)',
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