import { complianceBreakdown } from '../utils/complianceBreakdown'
import { Link } from 'react-router-dom'
import InfoTip from './InfoTip'
import { COMPLIANCE } from '../utils/complianceScale'
import { ON_TARGET_BAND } from '../utils/complianceBreakdown'

// Coach-facing weekday-against-weekend card: two rings for the average
// weekday and weekend day against the calorie target, the figures they stand
// for, and a ring per day of the week. No sentence under them: the reading is
// the coach's to make (see utils/complianceBreakdown.js for the counting).

const MUTED = 'var(--color-muted)'
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// The heatmap's own scale, so a ring and the grid beside it can never grade
// the same day differently: 140% read as green here while the grid painted it
// orange for over.
function ringColor(ratio) {
  if (ratio > 1 + ON_TARGET_BAND) return COMPLIANCE.over
  if (ratio >= 1 - ON_TARGET_BAND) return COMPLIANCE.onTarget
  if (ratio >= 0.6) return COMPLIANCE.under
  return COMPLIANCE.wellUnder
}

// A ring, the way Apple Fitness and Cronometer draw progress: it fills to the
// average day's share of the target, and past 100% it carries on round a
// second lap in a deeper shade, so "over" reads at a glance. Coloured by the
// compliance scale above, the grade the grid already gives.
function Ring({ ratio, size, stroke, children, label }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const first = Math.max(0, Math.min(1, ratio ?? 0))
  const second = Math.max(0, Math.min(1, (ratio ?? 0) - 1))
  const arc = (frac) => `${frac * c} ${c}`
  const color = ratio == null ? COMPLIANCE.noLog : ringColor(ratio)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ratio == null ? COMPLIANCE.noLog : `color-mix(in srgb, ${color} 18%, transparent)`} strokeWidth={stroke} />
        {ratio != null && first > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={arc(first)} />
        )}
        {second > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`color-mix(in srgb, ${color} 62%, #000)`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={arc(second)} />
        )}
      </svg>
      {children && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</span>}
    </span>
  )
}

export default function ComplianceBreakdown({ logsByDate, calorieTarget, targetHref, windowDays = 90, windowName = 'last 90 days' }) {
  const b = complianceBreakdown(logsByDate, calorieTarget, windowDays)
  if (!b.hasTarget) return null

  const target = Number(calorieTarget)
  const targetLabel = target.toLocaleString()
  const wd = b.weekday
  const we = b.weekend


  const pct = (cal) => (cal == null ? null : Math.round((cal / target) * 100))
  const seg = (label, x) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-6)' }}>
      <Ring ratio={x.avgCal == null ? null : x.avgCal / target} size={104} stroke={12}
        label={`${label}: ${x.avgCal == null ? 'no logs' : `${x.avgCal.toLocaleString()} calories a day, ${pct(x.avgCal)}% of target`}`}>
        <span className="tnum" style={{ fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-semibold)' }}>{x.avgCal == null ? '\u2014' : `${pct(x.avgCal)}%`}</span>
      </Ring>
      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)' }}>{label}</span>
    </div>
  )

  return (
    /* No border of its own: it sits in the Adherence card beside the grid,
       and a bordered box in there was a panel inside a panel. The caption
       above the grid names the window, so this header does not repeat it. */
    <div className="cb-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)', flex: 1 }}>
      <p style={{ fontSize: 'var(--text-xs)', color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
        <InfoTip text={`Each ring is that part of the week's average logged day against the calorie target: a full ring is on target, a second lap in a deeper shade is over. Coloured like the grid.\n\nThe small rings are each day of the week, so one day that slips shows on its own.\n\nIt reads the same days as the grid. ${windowName[0].toUpperCase()}${windowName.slice(1)}.`}>
          Weekday vs weekend
        </InfoTip>
      </p>

      {b.insufficient ? (
        <p style={{ fontSize: 'var(--text-sm)', color: MUTED, margin: 0 }}>
          Not enough logged days yet.
        </p>
      ) : (
        <div className="cb-body">
          {/* Two rings and the numbers they stand for: the average day itself,
              not its distance from target, so no arithmetic is left over. */}
          <div className="cb-rings">
            <div className="cb-pair">
              {seg('Weekdays', wd)}
              {seg('Weekends', we)}
            </div>
            <dl className="cb-figs tnum">
              <dt>Weekdays</dt><dd>{wd.avgCal == null ? '\u2014' : `${wd.avgCal.toLocaleString()} cal/day`}</dd>
              <dt>Weekends</dt><dd>{we.avgCal == null ? '\u2014' : `${we.avgCal.toLocaleString()} cal/day`}</dd>
              <dt>Target</dt><dd>{targetHref
                ? <Link to={targetHref} className="cb-targetlink ds-control" aria-label={`Calorie target, ${targetLabel}. Open targets`}>{targetLabel} cal</Link>
                : `${targetLabel} cal`}</dd>
            </dl>
          </div>

          <div className="cb-side">
          {/* A ring per day of the week, Apple Fitness's weekly row, Monday
              first; Saturday and Sunday are labelled in full ink. */}
          <div className="cb-week" role="list" aria-label="Average by day of the week">
            {[1, 2, 3, 4, 5, 6, 0].map(d => {
              const x = b.byDow?.[d] || { avgCal: null }
              const weekend = d === 0 || d === 6
              return (
                <div key={d} role="listitem" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
                  <Ring ratio={x.avgCal == null ? null : x.avgCal / target} size={34} stroke={6}
                    label={`${DAY_NAMES[d]}: ${x.avgCal == null ? 'no logs' : `${x.avgCal.toLocaleString()} calories, ${pct(x.avgCal)}% of target`}`} />
                  <span style={{ fontSize: 'var(--text-xs)', color: weekend ? 'var(--color-text)' : MUTED, fontWeight: weekend ? 'var(--weight-semibold)' : 'var(--weight-normal)' }}>{DAYS[d]}</span>
                </div>
              )
            })}
          </div>

          </div>
        </div>
      )}
    </div>
  )
}
