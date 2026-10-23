import { complianceBreakdown } from '../utils/complianceBreakdown'
import { Link } from 'react-router-dom'
import InfoTip from './InfoTip'

// Coach-facing "why is this one slipping" panel, drawn as diverging bars around
// a center "target" line: a segment's bar grows LEFT when it runs under target,
// RIGHT when over. Direction + length + color carry the story with almost no
// reading. Honest by construction (see utils/complianceBreakdown.js).
//
// Each segment is judged on its OWN merit, so a client who under-eats on
// weekdays AND over-eats on weekends shows both bars diverging.

const GOOD = 'var(--color-success)'
const WEAK = 'var(--color-warning)'
const MUTED = 'var(--color-muted)'
// The row grid, shared by the axis hint and every Row so the three parts line
// up by construction rather than by two places agreeing on the same numbers.
//
// Both columns are FIXED, deliberately. Sizing them to content would let a row
// reading "on plan" and a row reading "−683 cal" produce tracks of different
// widths, stacked — and two bars that no longer start at the same x are not a
// comparison any more.
//
// 64px was the old value column and it had no headroom at all: "−649 cal"
// measured 64px exactly, so the first client to run four digits off target
// ("−1,250 cal") would have clipped.
const LABEL_COL = 78
const VALUE_COL = 80

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
    <div className="cb-row" style={{ display: 'grid', gridTemplateColumns: `${LABEL_COL}px 1fr ${VALUE_COL}px`, alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 'var(--text-sm)', fontWeight: near ? 500 : 700, color: near ? 'var(--color-text)' : WEAK }}>
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
            position: 'absolute', top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-sm)',
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

      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

// `targetHref` makes the axis's "target" the way to the number rather than
// printing it in the caption. The caption used to read "vs 2,600 cal target ·
// last 90 days", which spent a line restating a figure the Targets panel owns
// — and gave the reader no way to act on it. Optional: without it the label
// stays plain text, so a caller with nowhere to point still renders.
export default function ComplianceBreakdown({ logsByDate, calorieTarget, targetHref, windowDays = 90, windowName = 'last 90 days' }) {
  const b = complianceBreakdown(logsByDate, calorieTarget, windowDays)
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
    /* A CARD, like the summary strip it sits beside. It used to be a top rule
       with content hanging under it, so the two halves of this row were two
       different kinds of object — one boxed, one not, starting at different
       heights and ending at different ones. No amount of aligning the bars
       inside fixes a row whose two sides are not the same sort of thing. */
    <div style={{
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: 'var(--space-16)',
      height: '100%',
      boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        {/* The chart is honest but not self-explanatory: a bar growing LEFT
            from a centre line is not a convention a coach has necessarily met,
            and nothing on the card said what ±10% or the window were. */}
        <p style={{ fontSize: 'var(--text-xs)', color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
          <InfoTip text={`Each bar is that segment's average logged day against the calorie target. Left of centre is under, right is over, longer is further off; a dot means within 10%.\n\nWeekdays and weekends are scored separately, so they can point opposite ways.\n\nIt reads the same days as the grid above — six months on a wide card, three on a narrow one.`}>
            Weekday vs weekend
          </InfoTip>
        </p>
        {/* The figure is gone, the sentence is not. "vs 2,600 cal target" spent
            the line restating a number the Targets panel owns; "target" now
            goes there instead, so the caption says what it is measured against
            and hands you the way to change it. */}
        <p style={{ fontSize: 'var(--text-xs)', color: MUTED, margin: 0 }}>
          vs {targetHref
            ? <Link to={targetHref} className="cb-targetlink ds-control" aria-label={`Calorie target, ${targetLabel} — open targets`}>Target</Link>
            : 'Target'} · {windowName}
        </p>
      </div>

      {b.insufficient ? (
        <p style={{ fontSize: 'var(--text-sm)', color: MUTED, margin: 0 }}>
          Not enough logged days yet.
        </p>
      ) : (
        <>
          {/* axis hint */}
          <div className="cb-axis" style={{ display: 'grid', gridTemplateColumns: `${LABEL_COL}px 1fr ${VALUE_COL}px`, alignItems: 'center', gap: 10 }}>
            <span />
            <div style={{ position: 'relative', fontSize: 'var(--text-xs)', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', margin: '2px 0 0' }}>{headline}</p>
          )}
        </>
      )}
    </div>
  )
}
