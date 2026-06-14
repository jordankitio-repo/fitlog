import { complianceBreakdown } from '../utils/complianceBreakdown'

// Coach-facing "why is this one slipping" panel, drawn as diverging bars around
// a center "target" line: a segment's bar grows LEFT when it runs under target,
// RIGHT when over. Direction + length + color carry the story with almost no
// reading. Honest by construction (see utils/complianceBreakdown.js).
//
// Each segment is judged on its OWN merit, so a client who under-eats on
// weekdays AND over-eats on weekends shows both bars diverging.

const GOOD = '#34d399'
const WEAK = '#fbbf24'
const MUTED = 'var(--color-muted)'
const MAX_BAR = 46 // each side of the center line spans up to this % of the track

// A day is "near target" within +/- this fraction (matches the day-level band).
const BAND = 0.1
// The bar reaches its end at this deviation, as a fraction of the target — an
// ABSOLUTE, interpretable scale ("half the target over/under"), comparable
// across clients. Beyond it the bar clamps and shows a › / ‹ overflow marker.
const FULL_SCALE = 0.5

function Row({ label, seg, target }) {
  const hasData = seg.logged > 0 && seg.avgDelta !== null
  const delta = hasData ? seg.avgDelta : 0
  const near = !hasData || Math.abs(delta) <= target * BAND
  const color = near ? GOOD : WEAK
  const fullScale = target * FULL_SCALE
  const widthPct = fullScale > 0 ? Math.min(1, Math.abs(delta) / fullScale) * MAX_BAR : 0
  const clamped = hasData && !near && Math.abs(delta) > fullScale

  const value = !hasData
    ? 'no data'
    : near
      ? 'on plan'
      : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} cal`

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '78px 1fr 64px', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: '0.8rem', fontWeight: near ? 500 : 700, color: near ? 'var(--color-text)' : WEAK }}>
        {label}
      </span>

      {/* track with a center target line and a bar diverging from it */}
      <div style={{ position: 'relative', height: 18 }}>
        <div style={{ position: 'absolute', inset: '0 0 0 0', top: '50%', height: 2, background: 'var(--color-border)', borderRadius: 2 }} />
        <div style={{ position: 'absolute', left: '50%', top: -1, bottom: -1, width: 1, background: 'var(--color-muted)', opacity: 0.5 }} />
        {hasData && !near && (
          <div style={{
            position: 'absolute', top: 4, height: 10, borderRadius: 3, background: color,
            ...(delta > 0
              ? { left: '50%', width: `${widthPct}%` }
              : { right: '50%', width: `${widthPct}%` }),
          }} />
        )}
        {clamped && (
          <span style={{
            position: 'absolute', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem',
            fontWeight: 700, color: WEAK, lineHeight: 1,
            ...(delta > 0 ? { left: `${50 + MAX_BAR}%`, marginLeft: 2 } : { right: `${50 + MAX_BAR}%`, marginRight: 2 }),
          }}>
            {delta > 0 ? '›' : '‹'}
          </span>
        )}
        {hasData && near && (
          <div style={{ position: 'absolute', left: '50%', top: 3, width: 12, height: 12, marginLeft: -6, borderRadius: '50%', background: GOOD }} />
        )}
      </div>

      <span style={{ fontSize: '0.78rem', fontWeight: 600, color, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export default function ComplianceBreakdown({ logsByDate, calorieTarget }) {
  const b = complianceBreakdown(logsByDate, calorieTarget)
  if (!b.hasTarget) return null

  const target = Number(calorieTarget)
  const targetLabel = target.toLocaleString()
  const wd = b.weekday
  const we = b.weekend

  // One-line takeaway that names the weekday-vs-weekend PATTERN — the numbers
  // are already on the bars, so the prose adds the "so what" instead of
  // repeating them.
  const hasData = (seg) => seg.logged > 0 && seg.avgDelta !== null
  const off = (seg) => hasData(seg) && Math.abs(seg.avgDelta) > target * BAND
  const dir = (seg) => (seg.avgDelta > 0 ? 'over' : 'under')
  const wdOff = off(wd)
  const weOff = off(we)
  // The gap BETWEEN weekdays and weekends — this is genuinely new (not on a bar).
  const gap = Math.round(Math.abs((wd.avgDelta || 0) - (we.avgDelta || 0)))
  const bigGap = gap > target * BAND

  let headline = null
  if (!b.insufficient) {
    if (!wdOff && !weOff) {
      headline = 'On target all week.'
    } else if (wdOff && weOff && dir(wd) === dir(we)) {
      headline = bigGap
        ? `${Math.abs(we.avgDelta) >= Math.abs(wd.avgDelta) ? 'Weekends' : 'Weekdays'} run further ${dir(wd)} — about ~${gap.toLocaleString()} cal/day apart.`
        : `Consistently ${dir(wd)} all week, not just weekends.`
    } else if (wdOff && weOff) {
      headline = `Split week — ${dir(wd)} on weekdays, ${dir(we)} on weekends.`
    } else {
      const o = wdOff ? { where: 'Weekdays', other: 'weekends', seg: wd } : { where: 'Weekends', other: 'weekdays', seg: we }
      headline = `${o.where} are the gap — ${dir(o.seg)} target, while ${o.other} stay on plan.`
    }
  }

  return (
    <div style={{
      marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontSize: '0.7rem', color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
          Weekday vs weekend
        </p>
        <p style={{ fontSize: '0.72rem', color: MUTED, margin: 0 }}>vs {targetLabel} cal target · last 90 days</p>
      </div>

      {b.insufficient ? (
        <p style={{ fontSize: '0.8rem', color: MUTED, margin: 0 }}>
          Not enough logged days yet to compare weekdays vs weekends.
        </p>
      ) : (
        <>
          {/* axis hint */}
          <div style={{ display: 'grid', gridTemplateColumns: '78px 1fr 64px', alignItems: 'center', gap: 10 }}>
            <span />
            <div style={{ position: 'relative', fontSize: '0.62rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span style={{ position: 'absolute', left: 0 }}>under</span>
              <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>target</span>
              <span style={{ position: 'absolute', right: 0 }}>over</span>
            </div>
            <span />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Row label="Weekdays" seg={wd} target={target} />
            <Row label="Weekends" seg={we} target={target} />
          </div>

          {headline && (
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text)', margin: '2px 0 0' }}>{headline}</p>
          )}
        </>
      )}
    </div>
  )
}
