import { energyBalanceRead } from '../utils/energyBalanceRead'

// Coach-only instrument. Surfaces empirical maintenance (as a range whose width
// is the confidence), weight rate, and trajectory — facts the coach reads
// against the plan they set. No verdicts, no directives; amber only marks a
// caveat, never a "bad" grade.

const MUTED = 'var(--color-muted)'
const WEAK = '#fbbf24'

function fmtRate(r) {
  if (r > -0.05 && r < 0.05) return 'flat'
  return `${r < 0 ? 'down' : 'up'} ${Math.abs(r).toFixed(1)} lb/wk`
}

function Row({ label, value, note, warn }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--color-text)' }}>{label}</span>
      <span style={{ fontSize: '0.8rem', textAlign: 'right' }}>
        <strong style={{ fontWeight: 600, color: 'var(--color-text)' }}>{value}</strong>
        {note && <span style={{ color: warn ? WEAK : MUTED, fontSize: '0.72rem' }}>{' · '}{note}</span>}
      </span>
    </div>
  )
}

export default function EnergyBalanceRead({ calorieSeries, weightSeries, calorieTarget }) {
  const r = energyBalanceRead({ calorieSeries, weightSeries, calorieTarget })
  if (!r.hasTarget) return null

  const num = (n) => n.toLocaleString()

  let maintNote = 'estimate · assumes logging accurate'
  let maintWarn = false
  if (r.hasData) {
    if (r.plausibility.flag === 'low') { maintNote = `low vs typical (~${num(r.plausibility.typicalLow)}–${num(r.plausibility.typicalHigh)})`; maintWarn = true }
    else if (r.plausibility.flag === 'high') { maintNote = `high vs typical (~${num(r.plausibility.typicalLow)}–${num(r.plausibility.typicalHigh)})`; maintWarn = true }
    else if (r.settling) { maintNote = 'trend still settling'; maintWarn = true }
  }

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
            warn={maintWarn}
          />
          <Row label="Weight trend" value={fmtRate(r.rateLbPerWk)} />
          <Row
            label="Logged vs target"
            value={`${num(r.avgIntake)} vs ${num(r.target)} (${r.loggedVsTarget >= 0 ? '+' : '−'}${Math.abs(r.loggedVsTarget)})`}
          />
          {r.trajectory && (
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text)', margin: '2px 0 0' }}>
              Vs the prior window: maintenance ~{num(r.trajectory.prevMaintenance)} → ~{num(r.maintenance.mid)}, rate {fmtRate(r.trajectory.prevRateLbPerWk)} → {fmtRate(r.rateLbPerWk)}.
            </p>
          )}
          {r.plausibility.flag === 'low' && (
            <p style={{ fontSize: '0.78rem', color: MUTED, margin: '2px 0 0' }}>
              A maintenance this low usually means intake is under-logged — though it can be a genuinely low activity level. The read can't tell which.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
