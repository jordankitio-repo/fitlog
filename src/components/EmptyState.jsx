function EmptyState({ icon, title, description, action }) {
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
      {icon && (
        <span style={{ marginBottom: '4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
          {icon}
        </span>
      )}
      <p style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: 'var(--text-base)' }}>{title}</p>
      {description && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', maxWidth: '260px', lineHeight: '1.5' }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: '10px' }}>{action}</div>}
    </div>
  )
}

export default EmptyState
