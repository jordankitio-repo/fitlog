import { useState } from 'react'

// Selectable chip — sort/slot/cadence toggles. `active` flips it to the filled
// primary state. Inactive chips sit on the raised control surface rather than a
// flat outline, so they read as pressable; see --control-* in src/index.css.
export default function Pill({ active = false, style, children, ...rest }) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)
  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false) }}
      onFocus={() => setHovered(true)}
      onBlur={() => { setHovered(false); setPressed(false) }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      style={{
        background: active
          ? 'var(--color-primary)'
          : hovered ? 'var(--control-bg-hover)' : 'var(--control-bg)',
        color: active ? 'var(--color-on-accent)' : hovered ? 'var(--color-text)' : 'var(--color-text-dim)',
        border: `1px solid ${active ? 'var(--color-primary)' : hovered ? 'var(--control-bd-hover)' : 'var(--control-bd)'}`,
        boxShadow: pressed
          ? 'var(--control-shadow-active)'
          : active ? 'var(--control-shadow-accent)' : 'var(--control-shadow)',
        transform: pressed ? 'translateY(0.5px)' : 'none',
        borderRadius: '999px',
        padding: '5px 12px',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, color 140ms ease',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
