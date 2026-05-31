function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  type = 'button',
  style = {}
}) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: 600,
    borderRadius: 'var(--radius)',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.6 : 1,
    border: 'none',
    fontFamily: 'inherit',
    transition: 'filter 0.15s ease, transform 0.1s ease',
    width: fullWidth ? '100%' : 'fit-content',
    whiteSpace: 'nowrap',
  }

  const sizes = {
    sm: { padding: '6px 12px', fontSize: '0.8rem' },
    md: { padding: '10px 20px', fontSize: '0.875rem' },
    lg: { padding: '12px 24px', fontSize: '1rem' },
  }

  const variants = {
    primary: {
      backgroundColor: 'var(--color-primary)',
      color: '#fff',
      border: 'none',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--color-muted)',
      border: '1px solid var(--color-border)',
    },
    danger: {
      backgroundColor: 'transparent',
      color: '#f87171',
      border: '1px solid #f87171',
    },
    'danger-solid': {
      backgroundColor: '#f87171',
      color: '#fff',
      border: 'none',
    },
    outline: {
      backgroundColor: 'transparent',
      color: 'var(--color-primary)',
      border: '1px solid var(--color-primary)',
    },
    muted: {
      backgroundColor: 'transparent',
      color: 'var(--color-muted)',
      border: '1px solid var(--color-border)',
    },
    ai: {
      backgroundColor: '#1a1a1a',
      color: '#a78bfa',
      border: '1px solid #a78bfa',
    },
  }

  const Spinner = () => (
    <span style={{
      width: '14px', height: '14px',
      border: `2px solid ${variant === 'primary' ? '#fff' : variant === 'ai' ? '#a78bfa' : 'var(--color-primary)'}`,
      borderTopColor: 'transparent',
      borderRadius: '50%',
      display: 'inline-block',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0
    }} />
  )

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="btn"
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

export default Button
