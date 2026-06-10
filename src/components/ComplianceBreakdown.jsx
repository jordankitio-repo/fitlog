import { complianceBreakdown } from '../utils/complianceBreakdown'

// Coach-facing "why is this one slipping" panel: weekday vs weekend ADHERENCE.
// Honest by construction (see utils/complianceBreakdown.js) — counts + magnitude,
// descriptive language, and it stays quiet until there's enough data to compare.

const GOOD = '#34d399'
const WEAK = '#fbbf24'
const MUTED = 'var(--color-muted)'

function SegmentRow({ label, seg, isWeaker }) {
  if (seg.logged === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: '0.875rem', color: MUTED }}>{label}</span>
        <span style={{ fontSize: '0.8rem', color: MUTED }}>no days logged</span>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: '0.875rem', fontWeight: isWeaker ? 700 : 500, color: isWeaker ? WEAK : 'var(--color-text)' }}>
        {label}
      </span>
      <span style={{ fontSize: '0.8rem', color: MUTED }}>
        <strong style={{ color: isWeaker ? WEAK : GOOD }}>{seg.onTarget} of {seg.logged}</strong> on target
        {seg.over > 0 && (
          <> · {seg.over} over{seg.avgOverDelta ? ` (avg +${seg.avgOverDelta} cal)` : ''}</>
        )}
      </span>
    </div>
  )
}

export default function ComplianceBreakdown({ logsByDate, calorieTarget }) {
  const b = complianceBreakdown(logsByDate, calorieTarget)
  if (!b.hasTarget) return null

  const headline = b.weaker === 'weekend'
    ? 'Adherence dips on weekends.'
    : b.weaker === 'weekday'
      ? 'Adherence dips on weekdays.'
      : null

  return (
    <div style={{
      marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <p style={{
        fontSize: '0.7rem', color: MUTED, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0,
      }}>
        Weekday vs weekend
      </p>

      {b.insufficient ? (
        <p style={{ fontSize: '0.8rem', color: MUTED, margin: 0 }}>
          Not enough logged days yet to compare weekdays vs weekends.
        </p>
      ) : (
        <>
          <SegmentRow label="Weekdays" seg={b.weekday} isWeaker={b.weaker === 'weekday'} />
          <SegmentRow label="Weekends" seg={b.weekend} isWeaker={b.weaker === 'weekend'} />
          {headline && (
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text)', margin: '2px 0 0' }}>{headline}</p>
          )}
        </>
      )}
    </div>
  )
}
