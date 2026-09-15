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

  // ── The elevation ladder ────────────────────────────────────────────────
  // Elevation encodes INVITATION: how much a control wants to be pressed, which
  // is the same thing as its rank in the action hierarchy. Both the Vercel and
  // Cloudflare dashboards run this exact ladder.
  //
  //   1  ACCENT + ELEVATED   filled brand colour, accent shadow.
  //                          "Do the thing." AT MOST ONE PER VIEW.
  //                          primary · danger-solid
  //                          (their "Get tickets" / "Add New")
  //
  //   2  NEUTRAL + ELEVATED  raised surface, hairline border, 1px shadow.
  //                          Actions you're expected to reach for.
  //                          muted · outline · danger · ai
  //
  //                          `action` is rank 2 too and looks identical at
  //                          rest; it turns GREEN on hover/press because it
  //                          CHANGES SOMETHING FOR A CLIENT (nudge, invite)
  //                          where `muted` only navigates. Elevation encodes
  //                          invitation; hue encodes consequence, revealed at
  //                          the moment of commitment.
  //                          (their "Learn more" / "Upgrade to Pro")
  //
  //   3  QUIET               STILL A BUTTON. Flat fill, soft border, no shadow,
  //                          no gradient. Visible at rest; it simply does not
  //                          invite. Cancel, Remove, Nudge.
  //                          ghost
  //                          (their "Learn more" beside "Get tickets", their
  //                           grey "Upgrade")
  //
  //  A rank-3 control is NOT chrome-less. Deleting the boundary turns a button
  //  into a link and the affordance disappears until hover, which is a bug, not
  //  restraint. Rank is expressed INSIDE the boundary — fill weight, border
  //  strength, text colour — never by removing it. Only rank 4 has no chrome.
  //
  //   4  NO CHROME           nothing until hover. Icon-only affordances.
  //                          ui/IconButton
  //                          (their "···" overflow menus)
  //
  // The mistake to avoid is rank inflation: when three controls in a row are all
  // elevated, none of them reads as the answer. If everything is raised, nothing
  // is. Pick the rank by what you want pressed, not by what looks nicest alone.
  //
  // Each variant declares its rest AND hover surface. The old code had a single
  // `filter: brightness(1.12)` hover, which is a no-op on a transparent
  // background — every secondary button in the app had no hover feedback at all,
  // which is most of why they read as dead.
  const variants = {
    primary: {
      rest: { background: 'var(--color-primary)', color: 'var(--color-on-accent)', border: '1px solid transparent', boxShadow: 'var(--control-shadow-accent)' },
      hover: { filter: 'brightness(1.08)' },
    },
    // Acts on a client: sends a nudge, sends an invite. IDENTICAL to `muted` at
    // rest — a roster full of green buttons is noise, and nine rows of standing
    // colour says nothing. The green appears on hover and press, which is the
    // moment it is worth saying: this one reaches a real person. Consequence is
    // revealed as you commit, not advertised while you scan.
    action: {
      rest: { background: 'var(--control-bg)', color: 'var(--color-text-dim)', border: '1px solid var(--control-bd)', boxShadow: 'var(--control-shadow)' },
      // Surface and label only. The border never changes on hover — that rule
      // applies here as much as anywhere, and a brightening outline was exactly
      // what made `muted` feel wrong before.
      hover: { background: 'var(--control-bg-accent-hover)', color: 'var(--color-primary)' },
    },
    muted: {
      rest: { background: 'var(--control-bg)', color: 'var(--color-text-dim)', border: '1px solid var(--control-bd)', boxShadow: 'var(--control-shadow)' },
      hover: { background: 'var(--control-bg-hover)', color: 'var(--color-text)' },
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
    // Rank 3. Flat, not absent: a real boundary, just no gradient and no shadow,
    // so it reads as a button that is present rather than one asking to be
    // pressed. Rank 2 is raised and lit; this one sits flush.
    ghost: {
      rest: {
        background: 'var(--color-surface-2)',
        color: 'var(--color-muted)',
        border: '1px solid var(--color-border)',
        boxShadow: 'none',
      },
      hover: {
        background: 'var(--control-bg-hover)',
        color: 'var(--color-text)',
      },
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
      onBlur={() => setPressed(false)}
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
