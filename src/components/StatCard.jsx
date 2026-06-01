function StatCard({ label, value, color, sub }) {
  return (
    <div
      className="stat-card"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <p style={{
        fontSize: '0.7rem',
        color: 'var(--color-muted)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        margin: 0
      }}>
        {label}
      </p>
      <p style={{
        fontSize: '1.5rem',
        fontWeight: 700,
        color: color || 'var(--color-text)',
        lineHeight: 1.2,
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
