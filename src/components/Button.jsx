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
  style = {},
  ...rest
}) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-8)',
    fontWeight: 'var(--weight-medium)',
    borderRadius: 'var(--radius)',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.6 : 1,
    border: 'none',
    fontFamily: 'inherit',
    transition: 'background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, color 140ms ease, filter 140ms ease',
    width: fullWidth ? '100%' : 'fit-content',
    // Constant overlay — never animates, so the colour underneath is free to.
    backgroundImage: 'var(--control-sheen)',
    whiteSpace: 'nowrap',
  }

  // A height floor per size, not just padding. Without it an icon-only button
  // is as tall as its glyph — the day-stepper arrows came out 27px next to
  // 30px text buttons in the same strip, which is the kind of 3px that reads
  // as sloppy without being obviously wrong. ui/Pill used to carry this floor
  // alone; it belongs on the size, so every control of a given size agrees by
  // construction rather than by each call site remembering.
  const sizes = {
    sm: { padding: '6px 12px', fontSize: 'var(--text-sm)', minHeight: '30px' },
    md: { padding: '10px 20px', fontSize: 'var(--text-base)', minHeight: '39px' },
    lg: { padding: '12px 24px', fontSize: 'var(--text-body)', minHeight: '45px' },
  }

  // ── The elevation ladder ────────────────────────────────────────────────
  // Elevation encodes INVITATION: how much a control wants to be pressed, which
  // is the same thing as its rank in the action hierarchy. Both the Vercel and
  // Cloudflare dashboards run this exact ladder.
  //
  //   1  ACCENT + ELEVATED   filled brand colour, accent shadow.
  //                          "Do the thing." AT MOST ONE PER PANEL, and never
  //                          repeated down a list — nine of the same green
  //                          button in a roster read as marked rows, not as
  //                          actions. (This used to say "per VIEW", which
  //                          demoted every commit on a 14-panel record page.
  //                          See D3 in docs/design-system.md.)
  //                          primary · danger-solid
  //                          (their "Get tickets" / "Add New")
  //
  //   2  NEUTRAL + ELEVATED  raised surface, hairline border, 1px shadow.
  //                          Actions you're expected to reach for.
  //                          muted · danger · ai
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
      rest: { backgroundColor: 'var(--color-primary-fill)', color: 'var(--color-on-primary-fill)', border: '1px solid transparent', boxShadow: 'var(--control-shadow-accent)' },
      hover: { filter: 'brightness(1.08)' },
    },
    // Acts on a client: sends a nudge, sends an invite. IDENTICAL to `muted` at
    // rest — a roster full of green buttons is noise, and nine rows of standing
    // colour says nothing. The green appears on hover and press, which is the
    // moment it is worth saying: this one reaches a real person. Consequence is
    // revealed as you commit, not advertised while you scan.
    action: {
      rest: { backgroundColor: 'var(--control-bg)', color: 'var(--color-text-dim)', border: '1px solid var(--control-bd)', boxShadow: 'var(--control-shadow)' },
      // Surface and label only. The border never changes on hover — that rule
      // applies here as much as anywhere, and a brightening outline was exactly
      // what made `muted` feel wrong before.
      hover: { backgroundColor: 'var(--control-bg-accent-hover)', color: 'var(--control-fg-accent-hover)' },
    },
    muted: {
      rest: { backgroundColor: 'var(--control-bg)', color: 'var(--color-text-dim)', border: '1px solid var(--control-bd)', boxShadow: 'var(--control-shadow)' },
      hover: { backgroundColor: 'var(--control-bg-hover)', color: 'var(--color-text)' },
    },
    // `outline` is DELETED, not merely unused. It stood in permanent green —
    // green text inside a green-tinted border — which is the advertised-green
    // this system moved away from when `action` made the hue something revealed
    // at the moment of commitment. In practice it read as a ring drawn round a
    // button for no stated reason, and it never sat beside a `muted` sibling
    // without looking like a different kind of control. All nine call sites are
    // `muted`; anything that genuinely needs to say "this reaches a client"
    // is `action`, and the one commit per panel is `primary`.
    // Destructive, and built exactly like `action`: identical to `muted` at rest,
    // red on hover and press. It used to stand in permanent red-on-red — red
    // text AND a red border, with nothing left to escalate to when you actually
    // committed. A page with a standing red button reads as broken rather than
    // careful, and it drowns out the red that means a CLIENT is in trouble.
    // Consequence is revealed as you commit; `danger-solid` is the confirm.
    danger: {
      rest: { backgroundColor: 'var(--control-bg)', color: 'var(--color-text-dim)', border: '1px solid var(--control-bd)', boxShadow: 'var(--control-shadow)' },
      // Surface and label only. The border never moves on hover, same as action.
      // Tuned to lift the SAME distance as `action`, so "this reaches a client"
      // and "this destroys something" are equally loud and differ only in cast.
      // Measured luminance (rest -> hover):
      //   dark  surface  neutral 30.0 -> green 31.7 · red 31.3
      //   dark  label    207      -> neutral 240 · green 232.6 · red 230.0
      //   light surface  245.4    -> green 231.9 · red 232.9
      //   light label    62.6     -> neutral 23.7 · green 38.2 · red 38.5
      hover: { backgroundColor: 'var(--control-bg-danger-hover)', color: 'var(--control-fg-danger-hover)' },
    },
    'danger-solid': {
      rest: { backgroundColor: 'var(--color-error)', color: 'var(--color-on-accent)', border: '1px solid transparent', boxShadow: 'var(--control-shadow-accent)' },
      hover: { filter: 'brightness(1.08)' },
    },
    ai: {
      rest: { backgroundColor: 'var(--control-bg)', color: 'var(--color-ai)', border: '1px solid color-mix(in srgb, var(--color-ai) 45%, transparent)', boxShadow: 'var(--control-shadow)' },
      hover: { backgroundColor: 'color-mix(in srgb, var(--color-ai) 12%, transparent)', borderColor: 'var(--color-ai)' },
    },
    // Genuinely chrome-less: for a control that must not compete, like a
    // "Cancel" beside a primary action. Still gets a real hover.
    // Rank 3. Flat, not absent: a real boundary, just no gradient and no shadow,
    // so it reads as a button that is present rather than one asking to be
    // pressed. Rank 2 is raised and lit; this one sits flush.
    ghost: {
      rest: {
        backgroundColor: 'var(--color-surface-2)',
        color: 'var(--color-muted)',
        border: '1px solid var(--color-border)',
        boxShadow: 'none',
      },
      hover: {
        backgroundColor: 'var(--control-bg-hover)',
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
      className="btn ds-control"
      {...rest}
      style={{ ...base, ...sizes[size], ...v.rest, ...style, ...hoverStyle, ...activeStyle }}
    >
      {loading && <Spinner color={spinnerColor} />}
      {children}
    </button>
  )
}

export default Button
