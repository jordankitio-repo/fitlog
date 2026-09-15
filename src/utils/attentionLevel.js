// Coach attention triage — collapse a client's already-computed facts into a
// single red / yellow / green level plus the human reasons behind it.
//
// Doctrine (see Ai-context/decisions.md → "No fabricated-confidence numbers"):
// every signal here is an OBSERVED FACT (days since log, lock state, a check-in
// that didn't happen, a weak compliance count). There is no score, no percentage,
// no model — just facts the coach could verify by hand, ranked so they don't have
// to. Reasons are ordered most- to least-urgent; the UI shows reasons[0] as the
// badge label.
//
// This list used to include "a negative reaction". It shouldn't have: the branch
// that read it was deleted with the rest of the reactions feature in 60cc27f, and
// the column has been write-dead ever since. A doctrine that names a signal the
// code cannot observe is worse than no doctrine — the next reader believes it.
//
// `stats` is one entry from CoachDashboard's clientStats:
//   { daysSinceLog, checkIn, complianceItems, lockInfo }

// 7-day compliance count below this is "weak" (matches the <3 bucket the pills
// already render at reduced opacity in CoachDashboard).
const WEAK_COMPLIANCE = 3
// Days since last log that flips a client from yellow to red (matches the
// existing needsAttention threshold).
const STALE_LOG_DAYS = 4

// Reasons that mean "nothing has been set up to measure against" rather than
// "this client is slipping". They rank for the coach's attention like a yellow,
// but they are rendered GREY, because grey is the absence of a grade and there
// is no grade to give: no target, no scale, no performance to colour.
export const SETUP_REASONS = ['No targets set']

// `level`  severity — drives sorting and the roster counts.
// `tone`   how the UI paints it — same as level, EXCEPT 'setup', which is grey.
// They differ on purpose: a client with no targets still needs the coach, so it
// must not sink to the bottom with the green ones, but colouring it amber puts
// "the coach hasn't finished onboarding" on the same visual footing as "this
// client is slipping". Severity and grade-ability are different questions.
export function attentionLevel(stats) {
  if (!stats) return { level: 'green', tone: 'green', reasons: [] }

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
  // No targets is FIRST among the yellows, and it is a real triage signal
  // rather than a rollup-only fact. Without targets there is nothing for the
  // client to be compliant WITH, so every compliance reason below is silently
  // uncomputable and the client would otherwise grade GREEN — "on track"
  // against nothing. It ranks first because it blocks the others: telling a
  // coach "Calories 0/7" is noise when no calorie target exists.
  // It is a coach to-do, not the client failing, which is why it is yellow.
  if (!(complianceItems || []).length) yellow.push('No targets set')

  if (daysSinceLog !== null && daysSinceLog >= 2 && daysSinceLog < STALE_LOG_DAYS) {
    yellow.push(`${daysSinceLog} days no log`)
  }
  if (!checkIn) yellow.push('No check-in')
  const weak = (complianceItems || []).filter(i => i.hasData && i.value < WEAK_COMPLIANCE)
  weak.forEach(i => yellow.push(`${i.label} ${i.value}/7`))

  if (red.length > 0) {
    const reasons = red.concat(yellow)
    return { level: 'red', tone: 'red', reasons }
  }
  if (yellow.length > 0) {
    // The badge shows reasons[0]; if that top reason is a setup gap, the row is
    // painted grey even though it still ranks as yellow.
    const tone = SETUP_REASONS.includes(yellow[0]) ? 'setup' : 'yellow'
    return { level: 'yellow', tone, reasons: yellow }
  }
  return { level: 'green', tone: 'green', reasons: [] }
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
    // Coverage: this week's check-ins the coach hasn't reviewed yet.
    checkInsToReview: stats.filter((s) => s?.checkIn && !s.checkIn.reviewed_at).length,
  }
}
