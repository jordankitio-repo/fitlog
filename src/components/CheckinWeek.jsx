import { useCheckinWeekCells } from '../hooks/useCheckinWeekCells'

// The week a check-in covers, in numbers, beside the client's words about it:
// the scale, how many days were logged, calories against target, steps. The
// review a coach does is "does what they say match what they did", and the
// answers alone left the other half three sections away (HubFit and MyPTHub
// put the numbers on the check-in for the same reason).
//
// The period is the check-in's own: week_of to the end of its cadence, cut at
// today for one still running. Neutral throughout: no grade colours (the
// roster grades; this informs), and the weight change is a grey arrow, since a
// gain is the goal for some clients and the warning for others.

// `weightUnit` is the reader's unit ('lbs' | 'kg'); without one, the weigh-in's.
export default function CheckinWeek({ clientId, weekOf, intervalWeeks = 1, weightUnit = null, compact = false }) {
  const cells = useCheckinWeekCells(clientId, weekOf, intervalWeeks, weightUnit)
  return (
    <div className="ci-week" aria-label="This period in numbers" style={{ minHeight: compact ? 40 : 52 }}>
      {cells ? cells.map(c => (
        <span key={c.label} className="ds-statcell ci-week-cell">
          <span className="ci-week-label">{c.label}</span>
          <span className={`tnum ci-week-value${compact ? ' is-compact' : ''}`}>{c.value}</span>
          {c.sub && <span className="tnum ci-week-sub">{c.sub}</span>}
        </span>
      )) : <span className="ci-week-label">Loading the week…</span>}
    </div>
  )
}
