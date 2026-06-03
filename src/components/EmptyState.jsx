function EmptyState({ icon, title, description }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 20px',
      gap: '8px',
      textAlign: 'center'
    }}>
      {icon && <span style={{ fontSize: '2rem', marginBottom: '4px' }}>{icon}</span>}
      <p style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.875rem' }}>{title}</p>
      {description && (
        <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', maxWidth: '240px', lineHeight: '1.5' }}>
          {description}
        </p>
      )}
    </div>
  )
}

export default EmptyState
