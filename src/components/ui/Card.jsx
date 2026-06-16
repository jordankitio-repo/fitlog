import { cardStyle } from '../../utils/styles'

const PADS = { none: 0, sm: 'var(--space-sm)', md: 'var(--space-md)', lg: 'var(--space-lg)' }

// The surface primitive — the cardStyle object as a component, with a padding
// scale token instead of ad-hoc values.
export default function Card({ pad = 'md', style, children, ...rest }) {
  return (
    <div style={{ ...cardStyle, padding: PADS[pad] ?? PADS.md, ...style }} {...rest}>
      {children}
    </div>
  )
}
