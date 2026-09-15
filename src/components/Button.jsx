import { useState } from 'react'

function Spinner({ color }) {
  return (
    <span style={{
      width: '14px', height: '14px',
      border: `2px solid ${color}`,
      borderTopColor: 'transparent',
      borderRadius: '50%',
      display: 'inline-block',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0
    }} />
  )
}

function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  type = 'button',
  ariaLabel,
  style = {}
}) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

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
    transition: 'background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, color 140ms ease, filter 140ms ease',
    width: fullWidth ? '100%' : 'fit-content',
    whiteSpace: 'nowrap',
  }

  const sizes = {
    sm: { padding: '6px 12px', fontSize: 'var(--text-sm)' },
    md: { padding: '10px 20px', fontSize: 'var(--text-base)' },
    lg: { padding: '12px 24px', fontSize: 'var(--text-body)' },
  }

  // Each variant declares its rest AND hover surface. The old code had a single
  // `filter: brightness(1.12)` hover, which is a no-op on a transparent
  // background — every secondary button in the app had no hover feedback at all,
  // which is most of why they read as dead.
  const variants = {
    primary: {
      rest: { background: 'var(--color-primary)', color: 'var(--color-on-accent)', border: '1px solid transparent', boxShadow: 'var(--control-shadow-accent)' },
      hover: { filter: 'brightness(1.08)' },
    },
    muted: {
      rest: { background: 'var(--control-bg)', color: 'var(--color-text-dim)', border: '1px solid var(--control-bd)', boxShadow: 'var(--control-shadow)' },
      hover: { background: 'var(--control-bg-hover)', borderColor: 'var(--control-bd-hover)', color: 'var(--color-text)' },
    },
    outline: {
      rest: { background: 'var(--control-bg)', color: 'var(--color-primary)', border: '1px solid color-mix(in srgb, var(--color-primary) 45%, transparent)', boxShadow: 'var(--control-shadow)' },
      hover: { background: 'var(--color-primary-dim)', borderColor: 'var(--color-primary)' },
    },
    danger: {
      rest: { background: 'var(--control-bg)', color: 'var(--color-error)', border: '1px solid color-mix(in srgb, var(--color-error) 45%, transparent)', boxShadow: 'var(--control-shadow)' },
      hover: { background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', borderColor: 'var(--color-error)' },
    },
    'danger-solid': {
      rest: { background: 'var(--color-error)', color: 'var(--color-on-accent)', border: '1px solid transparent', boxShadow: 'var(--control-shadow-accent)' },
      hover: { filter: 'brightness(1.08)' },
    },
    ai: {
      rest: { background: 'var(--control-bg)', color: 'var(--color-ai)', border: '1px solid color-mix(in srgb, var(--color-ai) 45%, transparent)', boxShadow: 'var(--control-shadow)' },
      hover: { background: 'color-mix(in srgb, var(--color-ai) 12%, transparent)', borderColor: 'var(--color-ai)' },
    },
    // Genuinely chrome-less: for a control that must not compete, like a
    // "Cancel" beside a primary action. Still gets a real hover.
    ghost: {
      rest: { background: 'transparent', color: 'var(--color-muted)', border: '1px solid transparent', boxShadow: 'none' },
      hover: { background: 'var(--color-surface-2)', color: 'var(--color-text)' },
    },
  }

  const spinnerColor = (variant === 'primary' || variant === 'danger-solid') ? 'var(--color-on-accent)' : variant === 'ai' ? 'var(--color-ai)' : 'var(--color-primary)'
  const v = variants[variant] ?? variants.muted
  const live = !disabled && !loading
  const hoverStyle = hovered && live ? v.hover : {}
  // Pressed: the surface sinks. One frame of physics is what makes a control
  // feel like a control.
  const activeStyle = pressed && live
    ? { boxShadow: 'var(--control-shadow-active)', transform: 'translateY(0.5px)' }
    : {}

  return (
    <button
      type={type}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false) }}
      onFocus={() => setHovered(true)}
      onBlur={() => { setHovered(false); setPressed(false) }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      className="btn"
      style={{ ...base, ...sizes[size], ...v.rest, ...style, ...hoverStyle, ...activeStyle }}
    >
      {loading && <Spinner color={spinnerColor} />}
      {children}
    </button>
  )
}

export default Button
