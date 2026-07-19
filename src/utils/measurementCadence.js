import { parseLocalDateString } from './dateHelpers'

// Recommended re-measure cadence for tape/body measurements. Industry standard is
// every 2–4 weeks, phase-dependent: active fat loss ~2 wk, gain/maintenance ~4 wk
// (see decisions.md). The floor is deliberate — circumference moves slowly and
// tape error alone is ~1–1.5 cm, so measuring more often than biweekly is mostly
// noise (and discouraging to clients). Coach-facing reads use the phase-precise
// cadence; the client's own reminder uses the steadier default so it never nags.
const CUT_DAYS = 14
const STEADY_DAYS = 28

// direction is the weight-goal direction ('down' = cutting → tighter cadence;
// 'up'/'maintain'/null = steadier). Mirrors weightTarget.js's `direction`.
export function measurementCadenceDays(direction) {
  return direction === 'down' ? CUT_DAYS : STEADY_DAYS
}

// Staleness read for the coach card / client prompt. Returns hasData:false when
// there's no prior measurement to reason about (the card shows its empty state).
export function measurementStatus({ lastMeasuredIso, cadenceDays = STEADY_DAYS, today = new Date() }) {
  if (!lastMeasuredIso) return { cadenceDays, daysSince: null, due: false, hasData: false }
  const last = parseLocalDateString(lastMeasuredIso)
  if (Number.isNaN(last?.getTime())) return { cadenceDays, daysSince: null, due: false, hasData: false }
  const t = new Date(today); t.setHours(12, 0, 0, 0)
  const daysSince = Math.max(0, Math.round((t - last) / 86400000))
  return { cadenceDays, daysSince, due: daysSince >= cadenceDays, hasData: true }
}
