import { energyBalanceRead } from '../utils/energyBalanceRead'
import InfoTip from './InfoTip'

// Coach-only instrument. We state only what we measured — maintenance (derived
// transparently from the two rows below it), the weight trend, and compliance
// with the prescribed target — and let the coach interpret. We deliberately do
// NOT assert physiological plausibility (e.g. "this is under-logged"): that
// needs a "true maintenance" reference the COACH has and we don't. Amber marks a
// caveat (data quality) or a deviation from the plan; green marks moving toward
// the goal / hitting the plan. Never a verdict on the outcome itself.

const GOOD = '#34d399'
const WEAK = '#fbbf24'
const MUTED = 'var(--color-muted)'
const TEXT = 'var(--color-text)'
const BAND = 0.1 // within ±10% of target = on plan (matches ComplianceBreakdown)

const toneColor = (tone) => (tone === 'toward' ? GOOD : tone === 'away' ? WEAK : TEXT)

function Row({ label, value, note, tip }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: '0.8rem', color: TEXT }}>{label}{tip && <InfoTip text={tip} />}</span>
      <span style={{ fontSize: '0.8rem', textAlign: 'right' }}>
        <strong style={{ fontWeight: 600, color: TEXT }}>{value}</strong>
        {note && <span style={{ fontSize: '0.72rem' }}>{' · '}{note}</span>}
      </span>
    </div>
  )
}

export default function EnergyBalanceRead({ calorieSeries, weightSeries, calorieTarget, weightGoal, weightGoalUnit }) {
  const r = energyBalanceRead({ calorieSeries, weightSeries, calorieTarget, weightGoal, weightGoalUnit })
  if (!r.hasTarget) return null

  const num = (n) => n.toLocaleString()

  // Maintenance caveat: honest data-quality only — wide band, or sparse logging.
  let maintNote
  if (r.hasData && r.settling) {
    maintNote = <span style={{ color: WEAK }}>still settling</span>
  } else if (r.hasData && r.coverage < 0.9) {
    maintNote = <span style={{ color: MUTED }}>estimate · {Math.round(r.coverage * 100)}% logged</span>
  } else {
    maintNote = <span style={{ color: MUTED }}>estimate</span>
  }

  // Weight trend: glyph colored relative to the coach's goal (toward/away).
  const rate = r.hasData ? r.rateLbPerWk : 0
  const flat = Math.abs(rate) < 0.05
  const weightValue = flat
    ? <span style={{ color: MUTED, fontWeight: 600 }}>flat</span>
    : (
      <>
        <span style={{ color: toneColor(r.rateTone), fontWeight: 700 }}>{rate < 0 ? '↓' : '↑'}</span>
        {' '}{Math.abs(rate).toFixed(1)} lb/wk
      </>
    )

  // Logged vs target gap: colored by compliance with the prescribed target —
  // green on plan (±10%), amber off plan in either direction.
  const gap = r.hasData ? r.loggedVsTarget : 0
  const onPlan = Math.abs(gap) <= r.target * BAND
  const gapNote = r.hasData
    ? <span style={{ color: onPlan ? GOOD : WEAK }}>{gap >= 0 ? '+' : '−'}{Math.abs(gap)}</span>
    : null

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontSize: '0.7rem', color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
          Energy balance read
        </p>
        <p style={{ fontSize: '0.72rem', color: MUTED, margin: 0 }}>coach-only · last {r.windowDays} days</p>
      </div>

      {!r.hasData ? (
        <p style={{ fontSize: '0.8rem', color: MUTED, margin: 0 }}>
          Need a couple weeks of logging + regular weigh-ins to read energy balance.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Row
            label="Est. maintenance"
            value={`~${num(r.maintenance.low)}–${num(r.maintenance.high)} cal`}
            note={maintNote}
            tip="Calories where weight would hold steady, inferred from logged intake and the weight trend this window. A range — it narrows as logging gets more consistent."
          />
          <Row
            label="Weight trend"
            value={weightValue}
            tip="Rate of weight change over the window, from a line fit across all weigh-ins (not just first vs last). The arrow shows toward (green) or away from (amber) the goal."
          />
          <Row
            label="Logged vs target"
            value={`${num(r.avgIntake)} / ${num(r.target)}`}
            note={gapNote}
            tip="Average logged calories vs the set target, and the gap. Green within ±10% of target, amber when off it."
          />
          {r.trajectory && (
            <p style={{ fontSize: '0.78rem', color: TEXT, margin: '2px 0 0' }}>
              Vs the prior window: maintenance ~{num(r.trajectory.prevMaintenance)} → ~{num(r.maintenance.mid)}, rate {fmtRateWord(r.trajectory.prevRateLbPerWk)} → {fmtRateWord(r.rateLbPerWk)}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function fmtRateWord(r) {
  if (r > -0.05 && r < 0.05) return 'flat'
  return `${r < 0 ? 'down' : 'up'} ${Math.abs(r).toFixed(1)} lb/wk`
}
