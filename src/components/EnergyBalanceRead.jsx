import { energyBalanceRead, WINDOW_OPTIONS } from '../utils/energyBalanceRead'
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

export default function EnergyBalanceRead({ calorieSeries, weightSeries, calorieTarget, weightGoal, weightGoalUnit, windowDays = 21, onWindowChange }) {
  const r = energyBalanceRead({ calorieSeries, weightSeries, calorieTarget, weightGoal, weightGoalUnit, windowDays })
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: MUTED }}>coach-only</span>
          {onWindowChange
            ? <WindowSelector windowDays={windowDays} onWindowChange={onWindowChange} />
            : <span style={{ fontSize: '0.72rem', color: MUTED }}>· last {r.windowDays} days</span>}
        </div>
      </div>

      {!r.hasData ? (
        <ReadinessBlock readiness={r.readiness} windowDays={r.windowDays} />
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
            <Row
              label="Trajectory"
              value={<TrajectoryDeltas r={r} num={num} />}
              tip="How this 21-day window compares with the one before it — is the maintenance estimate and the weight-change rate drifting? Direction only; small moves are usually just logging noise."
            />
          )}
        </div>
      )}
    </div>
  )
}

// Window picker — trade recency for confidence. Compact week pills; the read
// recomputes over the chosen span (the util is window-agnostic). An InfoTip on
// the label carries the "why 21 by default" so the choice isn't a mystery.
function WindowSelector({ windowDays, onWindowChange }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: '0.72rem', color: MUTED }}>
        · window<InfoTip text="How far back to read. Shorter = more recent but noisier (the band widens); longer = steadier but reflects older behavior. 21 days is the default — long enough that daily water swings don't dominate the weight trend, short enough to track the current phase." />
      </span>
      <span role="group" aria-label="Energy balance window" style={{ display: 'inline-flex', gap: 4 }}>
        {WINDOW_OPTIONS.map((d) => {
          const active = d === windowDays
          return (
            <button
              key={d}
              type="button"
              onClick={() => onWindowChange(d)}
              aria-pressed={active}
              style={{
                fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 999, lineHeight: 1.5,
                border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: active ? 'var(--color-primary-dim)' : 'transparent',
                color: active ? 'var(--color-primary)' : MUTED,
                cursor: 'pointer',
              }}
            >
              {d / 7}w
            </button>
          )
        })}
      </span>
    </span>
  )
}

// Trajectory as two glanceable deltas (vs the prior 21-day window): an arrow +
// magnitude for the maintenance estimate and the weight-change rate, so the
// direction reads at a glance instead of parsing a "was → now" sentence.
function TrajectoryDeltas({ r, num }) {
  // Diff the values as they're rounded for display (maintenance to 25 cal, rate
  // to 0.1 lb/wk), so the delta a coach sees equals the one they'd compute by eye.
  const r1 = (n) => Math.round(n * 10) / 10
  const dMaint = r.maintenance.mid - r.trajectory.prevMaintenance
  const dRate = r1(r1(r.rateLbPerWk) - r1(r.trajectory.prevRateLbPerWk))
  const delta = (d, eps, fmt, unit) =>
    Math.abs(d) < eps
      ? <span style={{ color: MUTED, fontWeight: 400 }}>→ steady</span>
      : <span style={{ color: TEXT }}>{d > 0 ? '↑' : '↓'} {fmt(Math.abs(d))}{unit}</span>
  const lbl = { color: MUTED, fontWeight: 400 }
  return (
    <span style={{ fontWeight: 400 }}>
      <span style={lbl}>Maint. </span>{delta(dMaint, 25, (v) => num(Math.round(v / 25) * 25), ' cal')}
      <span style={{ ...lbl, margin: '0 7px' }}>·</span>
      <span style={lbl}>Rate </span>{delta(dRate, 0.05, (v) => v.toFixed(1), ' lb/wk')}
    </span>
  )
}

// Empty state as an honest checklist: each requirement is a met/unmet fact with
// its own numbers, so the coach sees exactly what the read is waiting on rather
// than a catch-all that (wrongly) implicates weigh-ins when logging is the gap.
function ReadyRow({ ok, label, detail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ color: ok ? GOOD : WEAK, fontWeight: 700, fontSize: '0.8rem', width: 12, flexShrink: 0, textAlign: 'center' }}>{ok ? '✓' : '•'}</span>
      <span style={{ fontSize: '0.8rem', color: ok ? MUTED : TEXT }}>
        {label} <span style={{ color: ok ? MUTED : WEAK, fontWeight: ok ? 400 : 600 }}>{detail}</span>
      </span>
    </div>
  )
}

function ReadinessBlock({ readiness: rd, windowDays }) {
  if (!rd) {
    return (
      <p style={{ fontSize: '0.8rem', color: MUTED, margin: 0 }}>
        Need a couple weeks of logging + regular weigh-ins to read energy balance.
      </p>
    )
  }
  const need = (row, unit) => (row.ok ? '' : ` · need ${row.need}${unit}`)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ fontSize: '0.8rem', color: MUTED, margin: '0 0 2px' }}>Not enough logged yet to read energy balance:</p>
      <ReadyRow ok={rd.weighIns.ok} label="Weigh-ins" detail={`${rd.weighIns.have} in ${windowDays} days${need(rd.weighIns, '')}`} />
      <ReadyRow ok={rd.span.ok} label="Weigh-in span" detail={`${rd.span.have} days${need(rd.span, ' days')}`} />
      <ReadyRow ok={rd.logging.ok} label="Nutrition logging" detail={`${rd.logging.have}/${windowDays} days${need(rd.logging, ' days')}`} />
    </div>
  )
}
