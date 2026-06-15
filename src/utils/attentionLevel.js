// Coach attention triage — collapse a client's already-computed facts into a
// single red / yellow / green level plus the human reasons behind it.
//
// Doctrine (see Ai-context/decisions.md → "No fabricated-confidence numbers"):
// every signal here is an OBSERVED FACT (days since log, lock state, a negative
// reaction, a check-in that didn't happen, a weak compliance count). There is no
// score, no percentage, no model — just facts the coach could verify by hand,
// ranked so they don't have to. Reasons are ordered most- to least-urgent; the
// UI shows reasons[0] as the badge label.
//
// `stats` is one entry from CoachDashboard's clientStats:
//   { daysSinceLog, checkIn, complianceItems, lockInfo }

// 7-day compliance count below this is "weak" (matches the <3 bucket the pills
// already render at reduced opacity in CoachDashboard).
const WEAK_COMPLIANCE = 3
// Days since last log that flips a client from yellow to red (matches the
// existing needsAttention threshold).
const STALE_LOG_DAYS = 4

export function attentionLevel(stats) {
  if (!stats) return { level: 'green', reasons: [] }

  const { daysSinceLog, checkIn, complianceItems, lockInfo } = stats

  const red = []
  const yellow = []

  // --- Red: intervene now ---
  if (daysSinceLog === null) {
    red.push('Never logged')
  } else if (daysSinceLog >= STALE_LOG_DAYS) {
    red.push(`${daysSinceLog} days no log`)
  }
  if (lockInfo?.locked) red.push('Locked')

  // --- Yellow: watch (only meaningful if not already red) ---
  if (daysSinceLog !== null && daysSinceLog >= 2 && daysSinceLog < STALE_LOG_DAYS) {
    yellow.push(`${daysSinceLog} days no log`)
  }
  if (!checkIn) yellow.push('No check-in')
  const weak = (complianceItems || []).filter(i => i.hasData && i.value < WEAK_COMPLIANCE)
  weak.forEach(i => yellow.push(`${i.label} ${i.value}/7`))

  if (red.length > 0) return { level: 'red', reasons: red.concat(yellow) }
  if (yellow.length > 0) return { level: 'yellow', reasons: yellow }
  return { level: 'green', reasons: [] }
}

// Sort comparator: red first, then yellow, then green. Within a level, more
// reasons (more things wrong) ranks higher.
const LEVEL_RANK = { red: 0, yellow: 1, green: 2 }

export function compareByAttention(sa, sb) {
  const a = attentionLevel(sa)
  const b = attentionLevel(sb)
  const byLevel = LEVEL_RANK[a.level] - LEVEL_RANK[b.level]
  if (byLevel !== 0) return byLevel
  return b.reasons.length - a.reasons.length
}

// Portfolio rollup — the "100 clients with the attention of 20" headline.
// Built ON attentionLevel so per-client badges and these counts can never
// disagree. Also surfaces two data-quality facts the per-client triage can't:
// how many clients have no targets set (a coach to-do that blocks compliance
// scoring) and how many have effectively stopped logging.
// statsMap: { [clientId]: stat } as produced by computeClientStats.
export function summarizeRoster(statsMap = {}) {
  const stats = Object.values(statsMap)
  const levelCount = (lvl) => stats.filter((s) => attentionLevel(s).level === lvl).length
  return {
    total: stats.length,
    atRisk: levelCount('red'),
    review: levelCount('yellow'),
    onTrack: levelCount('green'),
    noTargets: stats.filter((s) => !(s?.complianceItems?.length)).length,
    notLogging: stats.filter((s) => s?.daysSinceLog === null || s?.daysSinceLog >= STALE_LOG_DAYS).length,
  }
}
