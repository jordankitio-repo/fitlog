// The app's icon set — ONE source, so icons stop being a mix of text glyphs
// (✓ ✕ ✎ ↻ ⠿ ← →) and emoji rendering in whatever the OS font happens to be.
//
// Style matches the SVGs already hand-written in the app: feather-style line
// art, stroke="currentColor" so an icon takes the colour of whatever it sits
// in, strokeWidth 1.75, round caps and joins. Size defaults to 1em so an icon
// inline with text scales with that text.
const PATHS = {
  check:    <polyline points="20 6 9 17 4 12" />,
  x:        <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  pencil:   <><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></>,
  repeat:   <><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
  grip:     <><circle cx="9" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="15" cy="18" r="1.4" /></>,
  left:     <polyline points="15 18 9 12 15 6" />,
  up:       <polyline points="18 15 12 9 6 15" />,
  down:     <polyline points="6 9 12 15 18 9" />,
  right:    <polyline points="9 18 15 12 9 6" />,
  arrowRight: <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
  info:     <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  leaf:     <><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" /></>,
}

export default function Icon({ name, size = '1em', strokeWidth = 1.75, style, ...rest }) {
  const path = PATHS[name]
  if (!path) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: '-0.125em', ...style }}
      {...rest}
    >
      {path}
    </svg>
  )
}
