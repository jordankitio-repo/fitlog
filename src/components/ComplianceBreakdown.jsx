import { complianceBreakdown } from '../utils/complianceBreakdown'

// Coach-facing "why is this one slipping" panel: on which days does the client
// stick to their calorie target. Honest by construction (see
// utils/complianceBreakdown.js) — counts + magnitude, descriptive language, and
// it stays quiet until there's enough data to compare.

const GOOD = '#34d399'
const WEAK = '#fbbf24'
const MUTED = 'var(--color-muted)'

// Lead each row with its dominant bucket so it's self-explanatory:
// "30 of 30 days near target" / "12 of 12 days over target (avg +900 cal)".
function SegmentRow({ label, seg, isWeaker }) {
  if (seg.logged === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: '0.875rem', color: MUTED }}>{label}</span>
        <span style={{ fontSize: '0.8rem', color: MUTED }}>no days logged</span>
      </div>
    )
  }

  const buckets = [
    { n: seg.onTarget, text: 'near target', kind: 'near' },
    { n: seg.over, text: 'over target', kind: 'over' },
    { n: seg.under, text: 'under target', kind: 'under' },
  ]
  const top = buckets.reduce((a, b) => (b.n > a.n ? b : a))

  let detail = `${top.n} of ${seg.logged} ${seg.logged === 1 ? 'day' : 'days'} ${top.text}`
  if (top.kind === 'over' && seg.avgOverDelta) detail += ` (avg +${seg.avgOverDelta} cal)`

  const color = isWeaker ? WEAK : top.kind === 'near' ? GOOD : MUTED

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: '0.875rem', fontWeight: isWeaker ? 700 : 500, color: isWeaker ? WEAK : 'var(--color-text)' }}>
        {label}
      </span>
      <span style={{ fontSize: '0.8rem', fontWeight: 600, color, textAlign: 'right' }}>{detail}</span>
    </div>
  )
}

export default function ComplianceBreakdown({ logsByDate, calorieTarget }) {
  const b = complianceBreakdown(logsByDate, calorieTarget)
  if (!b.hasTarget) return null

  const target = Number(calorieTarget).toLocaleString()

  // Carry the magnitude when the weaker segment is over-driven, so the takeaway
  // is a finding rather than a restatement of the rows.
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
      <div>
        <p style={{
          fontSize: '0.7rem', color: MUTED, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0,
        }}>
          Weekday vs weekend
        </p>
        <p style={{ fontSize: '0.75rem', color: MUTED, margin: '3px 0 0' }}>
          Daily calories vs the {target} cal target, last 90 days
        </p>
      </div>

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
