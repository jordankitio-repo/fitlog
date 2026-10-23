import { cardStyle } from '../../utils/styles'
import Icon from './Icon'
import IconButton from './IconButton'

// The app's one notice card. It started as three hand-rolled copies on
// Dashboard (coach offboarded, coach nudged, time to re-measure), each with its
// own padding, its own icon markup and its own bare <button> for the dismiss.
// D2: a hand-rolled copy is not wrong on the day it is written, it is wrong on
// the day the original changes.
//
// It lived in Dashboard.jsx until Billing needed the same card for a failed
// payment. Copying it into SubscriptionManager would have restarted exactly the
// drift it was written to end, so it moved here instead — the import in
// Dashboard is the whole change on that side, and the three call sites there
// pass the same props they always did.
//
// Shape is the "what IS wanted" recipe: a clean card with a UNIFORM border and
// a flat tint, never the coloured left edge. `tone` picks the tint and the
// glyph's stroke — amber for a recoverable state the user fixes by acting, green
// for routine.
//
// `icon` takes raw SVG children (paths, circles) rather than an Icon name,
// because a notice's glyph names its own one-off situation — a bell, a clock, a
// card — and the Icon set is for marks that recur across the app.
export default function Notice({ tone = 'primary', icon, children, action, onDismiss }) {
  const accent = tone === 'warning' ? 'var(--color-warning)' : 'var(--color-primary)'
  const tint = tone === 'warning' ? 'var(--color-warning-dim)' : 'var(--color-primary-dim)'
  return (
    <div className="ds-notice" style={{
      ...cardStyle,
      backgroundColor: tint,
      padding: 'var(--space-12) var(--space-16)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-12)',
    }}>
      <svg
        width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" style={{ flexShrink: 0 }}
      >
        {icon}
      </svg>
      <p style={{ flex: 1, fontSize: 'var(--text-base)', color: 'var(--color-text)', margin: 0, lineHeight: 1.6 }}>
        {children}
      </p>
      {action}
      {onDismiss && (
        <IconButton onClick={onDismiss} aria-label="Dismiss" style={{ flexShrink: 0 }}>
          <Icon name="x" size={18} />
        </IconButton>
      )}
    </div>
  )
}
