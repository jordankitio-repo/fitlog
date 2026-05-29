function StatCard({ label, value }) {
  return (
    <div style={{
      backgroundColor: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: '20px',
    }}>
      <p style={{ fontSize: '0.85rem', marginBottom: '8px' }}>{label}</p>
      <h2>{value}</h2>
    </div>
  )
}

export default StatCard