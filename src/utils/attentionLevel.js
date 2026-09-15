// Coach attention triage — collapse a client's already-computed facts into a
// single red / yellow / green level plus the human reasons behind it.
//
// Attention is the ROLL-UP lens: it surfaces whoever is worst across ALL three
// dimensions — logging, compliance, check-in — and names which one. Any of them
// can reach red. The other lenses each report one dimension for every client;
// this one reports the worst dimension per client, which is why it is the
// default and why it does not simply repeat "Last logged".
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

  // ── Logging ───────────────────────────────────────────────────────────────
  if (daysSinceLog === null) {
    red.push('Never logged')
  } else if (daysSinceLog >= STALE_LOG_DAYS) {
    red.push(`${daysSinceLog} days no log`)
  } else if (daysSinceLog >= 2) {
    yellow.push(`${daysSinceLog} days no log`)
  }
  if (lockInfo?.locked) red.push('Locked')

  // ── Setup ─────────────────────────────────────────────────────────────────
  // Without targets there is nothing to be compliant WITH, so the compliance
  // branch below is uncomputable and the client would otherwise grade GREEN —
  // on track against nothing. A coach to-do, not the client failing, so yellow.
  const items = (complianceItems || []).filter(i => i.hasData)
  if (!(complianceItems || []).length) {
    yellow.push('No targets set')
  } else if (items.length) {
    // ── Compliance ──────────────────────────────────────────────────────────
    // Reported in AGGREGATE, matching the Compliance lens: "4/14 days on
    // target", not "Calories 0/7 days". Per-metric detail belongs on the client
    // record — on a triage row it is noise, and it made the column show a
    // different metric for every client.
    //
    // Compliance can now reach RED. Previously only logging could, so a client
    // logging faithfully every day and hitting 0 of 14 targets graded YELLOW
    // while someone four days quiet graded RED — which is backwards, and it
    // left Attention mostly echoing the Last logged lens.
    const sum = items.reduce((t, i) => t + i.value, 0)
    const max = items.length * 7
    const text = `${sum}/${max} days on target`
    if (sum / max < WEAK_COMPLIANCE / 7) red.push(text)
    else if (sum / max < 5 / 7) yellow.push(text)
  }

  // ── Check-in ──────────────────────────────────────────────────────────────
  if (!checkIn) yellow.push('No check-in')

  if (red.length > 0) return { level: 'red', tone: 'red', reasons: red.concat(yellow) }
  if (yellow.length > 0) {
    // reasons[0] is what the badge shows; a setup gap is painted grey even
    // though it still ranks as yellow.
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
