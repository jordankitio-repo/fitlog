import { complianceBreakdown } from '../utils/complianceBreakdown'

// Coach-facing "why is this one slipping" panel: on which days does the client
// stick to their calorie target. Honest by construction (see
// utils/complianceBreakdown.js) — counts + magnitude, descriptive language, and
// it stays quiet until there's enough data to compare.
//
// Each segment is judged on its OWN merit (near target vs over vs under), not
// relative to the other — so a client who under-eats on weekdays AND over-eats
// on weekends gets both flagged, instead of the panel cancelling them out.

const GOOD = '#34d399'
const WEAK = '#fbbf24'
const MUTED = 'var(--color-muted)'

// The dominant bucket for a segment: where most of its logged days landed.
function segState(seg) {
  if (!seg || seg.logged === 0) return { kind: 'none' }
  const buckets = [
    { n: seg.onTarget, kind: 'near', text: 'near target' },
    { n: seg.over, kind: 'over', text: 'over target' },
    { n: seg.under, kind: 'under', text: 'under target' },
  ]
  const top = buckets.reduce((a, b) => (b.n > a.n ? b : a))
  return { ...top, logged: seg.logged, avgOverDelta: seg.avgOverDelta }
}

function SegmentRow({ label, state }) {
  if (state.kind === 'none') {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: '0.875rem', color: MUTED }}>{label}</span>
        <span style={{ fontSize: '0.8rem', color: MUTED }}>no days logged</span>
      </div>
    )
  }

  const off = state.kind !== 'near'
  let detail = `${state.n} of ${state.logged} ${state.logged === 1 ? 'day' : 'days'} ${state.text}`
  if (state.kind === 'over' && state.avgOverDelta) detail += ` (avg +${state.avgOverDelta} cal)`

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: '0.875rem', fontWeight: off ? 700 : 500, color: off ? WEAK : 'var(--color-text)' }}>
        {label}
      </span>
      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: off ? WEAK : GOOD, textAlign: 'right' }}>
        {detail}
      </span>
    </div>
  )
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1) }

export default function ComplianceBreakdown({ logsByDate, calorieTarget }) {
  const b = complianceBreakdown(logsByDate, calorieTarget)
  if (!b.hasTarget) return null

  const target = Number(calorieTarget).toLocaleString()
  const wd = segState(b.weekday)
  const we = segState(b.weekend)

  // Build the takeaway from each segment's own state.
  const offs = [
    { s: wd, where: 'Weekdays', wl: 'weekdays' },
    { s: we, where: 'Weekends', wl: 'weekends' },
  ].filter(o => o.s.kind === 'over' || o.s.kind === 'under')

  const clause = (o) => o.s.kind === 'over'
    ? `over on ${o.wl}${o.s.avgOverDelta ? ` (~+${o.s.avgOverDelta} cal/day)` : ''}`
    : `under on ${o.wl}`

  let headline = null
  if (!b.insufficient) {
    if (offs.length === 0 && wd.kind !== 'none' && we.kind !== 'none') {
      headline = 'On target across the week.'
    } else if (offs.length === 1) {
      const o = offs[0]
      headline = o.s.kind === 'over'
        ? `${o.where} run ~${o.s.avgOverDelta} cal/day over target.`
        : `${o.where} fall under target most days.`
    } else if (offs.length === 2) {
      headline = `${cap(clause(offs[0]))}, ${clause(offs[1])}.`
    }
  }

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
          <SegmentRow label="Weekdays" state={wd} />
          <SegmentRow label="Weekends" state={we} />
          {headline && (
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text)', margin: '2px 0 0' }}>{headline}</p>
          )}
        </>
      )}
    </div>
  )
}
