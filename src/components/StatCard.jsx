import { cardStyle } from '../utils/styles'

function StatCard({ label, value, color, sub }) {
  return (
    <div
      className="stat-card"
      style={{
        ...cardStyle,
        padding: '16px 20px',
        minHeight: '80px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
        {color && (
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: color, flex: '0 0 auto' }} />
        )}
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
      </div>
      <p className="stat-card-value" style={{
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