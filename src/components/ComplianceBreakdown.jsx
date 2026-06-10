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

  // Describe the deviation, not "on target" — that phrase means something looser
  // in the summary above (>=90% with no upper bound) and would read as a contradiction.
  const onPlan = seg.over === 0 && seg.under === 0
  let detail
  if (onPlan) {
    detail = 'on plan'
  } else {
    const parts = []
    if (seg.over > 0) parts.push(`${seg.over} over${seg.avgOverDelta ? ` (avg +${seg.avgOverDelta} cal)` : ''}`)
    if (seg.under > 0) parts.push(`${seg.under} under`)
    detail = parts.join(' · ')
  }
  const detailColor = isWeaker ? WEAK : onPlan ? GOOD : MUTED

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: '0.875rem', fontWeight: isWeaker ? 700 : 500, color: isWeaker ? WEAK : 'var(--color-text)' }}>
        {label}
      </span>
      <span style={{ fontSize: '0.8rem', color: MUTED }}>
        <span style={{ color: MUTED }}>{seg.logged} {seg.logged === 1 ? 'day' : 'days'} · </span>
        <strong style={{ color: detailColor, fontWeight: 600 }}>{detail}</strong>
      </span>
    </div>
  )
}

export default function ComplianceBreakdown({ logsByDate, calorieTarget }) {
  const b = complianceBreakdown(logsByDate, calorieTarget)
  if (!b.hasTarget) return null

  // Carry the magnitude when the weaker segment is over-driven, so the line is a
  // finding ("runs ~900 cal/day over") rather than just restating the rows.
  function headlineFor(which) {
    const seg = which === 'weekend' ? b.weekend : b.weekday
    const where = which === 'weekend' ? 'Weekends' : 'Weekdays'
    if (seg.over > seg.under && seg.avgOverDelta) return `${where} run ~${seg.avgOverDelta} cal/day over target.`
    if (seg.under > seg.over) return `${where} fall short of target most days.`
    return `Adherence dips on ${which === 'weekend' ? 'weekends' : 'weekdays'}.`
  }
  const headline = b.weaker ? headlineFor(b.weaker) : null

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
