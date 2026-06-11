import { energyBalanceRead } from '../utils/energyBalanceRead'

// Coach-only instrument. Facts + their uncertainty, read visually: a glyph for
// trend direction (colored relative to the coach's goal — toward = green, away
// = amber, neutral otherwise), and amber reserved for caveats only. No verdicts.

const GOOD = '#34d399'
const WEAK = '#fbbf24'
const MUTED = 'var(--color-muted)'
const TEXT = 'var(--color-text)'

const toneColor = (tone) => (tone === 'toward' ? GOOD : tone === 'away' ? WEAK : TEXT)

function Row({ label, value, note }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: '0.8rem', color: TEXT }}>{label}</span>
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

  // Maintenance caveat: the only amber is the flag word; the reference range is muted.
  let maintNote
  if (r.hasData && (r.plausibility.flag === 'low' || r.plausibility.flag === 'high')) {
    maintNote = (
      <>
        <span style={{ color: WEAK }}>{r.plausibility.flag === 'low' ? 'below typical' : 'above typical'}</span>
        <span style={{ color: MUTED }}> ({num(r.plausibility.typicalLow)}–{num(r.plausibility.typicalHigh)})</span>
      </>
    )
  } else if (r.hasData && r.settling) {
    maintNote = <span style={{ color: WEAK }}>still settling</span>
  } else {
    maintNote = <span style={{ color: MUTED }}>estimate · assumes logging accurate</span>
  }

  // Weight trend: colored glyph (relative to goal) + neutral magnitude.
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
          <Row label="Est. maintenance" value={`~${num(r.maintenance.low)}–${num(r.maintenance.high)} cal`} note={maintNote} />
          <Row label="Weight trend" value={weightValue} />
          <Row
            label="Logged vs target"
            value={`${num(r.avgIntake)} / ${num(r.target)}`}
            note={<span style={{ color: MUTED }}>{r.loggedVsTarget >= 0 ? '+' : '−'}{Math.abs(r.loggedVsTarget)}</span>}
          />
          {r.trajectory && (
            <p style={{ fontSize: '0.78rem', color: TEXT, margin: '2px 0 0' }}>
              Vs the prior window: maintenance ~{num(r.trajectory.prevMaintenance)} → ~{num(r.maintenance.mid)}, rate {fmtRateWord(r.trajectory.prevRateLbPerWk)} → {fmtRateWord(r.rateLbPerWk)}.
            </p>
          )}
          {r.plausibility.flag === 'low' && (
            <p style={{ fontSize: '0.78rem', color: MUTED, margin: '2px 0 0' }}>
              A maintenance this low usually means intake is under-logged — though it can be a genuinely low activity level. The read can&apos;t tell which.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Plain words for the trajectory sentence (a glyph there would collide with the
// trend row's arrow).
function fmtRateWord(r) {
  if (r > -0.05 && r < 0.05) return 'flat'
  return `${r < 0 ? 'down' : 'up'} ${Math.abs(r).toFixed(1)} lb/wk`
}
