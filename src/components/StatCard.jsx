import { Link } from 'react-router-dom'
import { cardStyle } from '../utils/styles'
import { Icon } from './ui'
import TargetBar from './TargetBar'

// `progress` is value / target (any size; TargetBar shows up to 125%). Without one
// there is nothing to fill, so no bar.
// `aside` sits at the right of the value, bottom-aligned with it: a small
// graph, the way Apple Health's pinned cards preview their chart.
// `to` makes the whole card a link to that metric's full chart, with Apple's
// chevron top-right to say so.
// `onOpen`, when given, runs instead of following `to` (the record's desktop
// scrolls to the chart in place, the way its rail does; see ClientView).
function StatCard({ label, value, sub, color, progress = null, aside = null, to = null, onOpen = null }) {
  const Root = to ? Link : 'div'
  return (
    <Root
      {...(to ? { to, onClick: onOpen ? (e) => { e.preventDefault(); onOpen() } : undefined } : {})}
      className={to ? 'stat-card stat-card-link ds-control' : 'stat-card'}
      style={{
        textDecoration: 'none',
        color: 'inherit',
        ...cardStyle,
        padding: 'var(--space-16) var(--space-20)',
        minHeight: '80px',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      {/* The label is chrome, so it is neutral (design-system B2: "labels take
          neutral tokens ONLY"; metric tokens are FILL colours, not text). The
          metric's colour lives in the progress bar below instead — the same
          split the client's Today panel makes for the same numbers, so a coach
          and their client read one day the same way. It was on the label for a
          while, which put CALORIES in green and PROTEIN in red as text. */}
      <p style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--color-muted)',
        fontWeight: 'var(--weight-medium)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        margin: 0
      }}>
        {label}
        {to && <Icon name="right" size={14} style={{ float: 'right', color: 'var(--color-faint)' }} />}
      </p>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'var(--space-12)' }}>
        <p className="stat-card-value" style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--color-text)',
          lineHeight: 1.1,
          margin: 0
        }}>
          {value}
        </p>
        {aside && <span style={{ flexShrink: 0, marginBottom: 'var(--space-2)' }}>{aside}</span>}
      </div>
      {sub && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', margin: 0 }}>{sub}</p>
      )}
      {/* The client's Today bar (TargetBar), at the foot as it is there: the
          target is a notch, so 138% reads past it instead of as the same full
          stripe as 100%. One bar for one number on both sides of coaching. */}
      {progress != null && color && (
        <span style={{ display: 'block', marginTop: 'var(--space-2)' }}>
          <TargetBar pct={progress * 100} color={color} />
        </span>
      )}
    </Root>
  )
}

export default StatCard