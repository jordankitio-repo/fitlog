import { cardStyle } from '../utils/styles'

function StatCard({ label, value, color, sub }) {
  return (
    <div
      className="stat-card"
      style={{
        ...cardStyle,
        borderLeft: color ? `3px solid ${color}` : '1px solid var(--color-border)',
        padding: '16px 20px',
        minHeight: '80px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <p style={{
        fontSize: '0.65rem',
        color: 'var(--color-muted)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        margin: 0
      }}>
        {label}
      </p>
      <p style={{
        fontSize: '1.75rem',
        fontWeight: 700,
        color: 'var(--color-text)',
        lineHeight: 1.1,
        margin: 0
      }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: '0.7rem', color: 'var(--color-muted)', margin: 0 }}>{sub}</p>
      )}
    </div>
  )
}

export default StatCard
