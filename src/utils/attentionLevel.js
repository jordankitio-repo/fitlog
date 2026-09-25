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
// ── The three dimensions ─────────────────────────────────────────────────────
// Each grades ONE thing for a client and returns { text, tone }. The roster's
// lenses render these directly; Attention takes the worst of the three. That is
// the whole relationship, in code rather than in prose: Attention cannot drift
// from the lenses because it is built out of them.
//
// tone: 'red' intervene · 'yellow' watch · 'green' fine · 'setup' nothing to
// grade against (rendered grey — see the colour rule in the design skill).

// Worst to best. Exported so the roster sorts by exactly the grade it renders:
// a column and its ordering must never come from two different calculations.
//
// Grey sits ABOVE yellow: a dimension nobody can measure is worse than one
// measuring badly. If a client's compliance is grey and their check-in is
// yellow, Attention grabs the grey. Red still beats grey, so a client who has
// not logged in five days outranks one who just needs targets setting.
export const TONE_RANK = { red: 0, setup: 1, yellow: 2, green: 3 }

export function gradeLogging(s) {
  // A locked client outranks the day count: the lock is why they stopped.
  if (s?.lockInfo?.locked) return { text: 'Locked', tone: 'red' }
  const d = s?.daysSinceLog
  if (d === null || d === undefined) return { text: 'Never logged', tone: 'red' }
  if (d >= STALE_LOG_DAYS) return { text: `${d} days no log`, tone: 'red' }
  if (d >= 2) return { text: `${d} days no log`, tone: 'yellow' }
  if (d === 1) return { text: 'Logged yesterday', tone: 'green' }
  return { text: 'Logged today', tone: 'green' }
}

export function gradeCompliance(s) {
  const all = s?.complianceItems || []
  // No targets means no scale, so there is no grade to give — not a failure.
  // `fix` names the section that resolves this, so the roster can offer it as
  // an action instead of a dead-end label. Nothing-logged has no `fix`: only the
  // client can resolve that one.
  if (!all.length) return { text: 'No targets set', tone: 'setup', fix: 'targets' }
  const items = all.filter(i => i.hasData)
  if (!items.length) return { text: 'Nothing logged', tone: 'setup' }
  // Aggregate, never per-metric: a column showing Calories for one client and
  // Steps for the next cannot be read down the page.
  const sum = items.reduce((t, i) => t + i.value, 0)
  const max = items.length * 7
  const ratio = sum / max
  const tone = ratio < WEAK_COMPLIANCE / 7 ? 'red' : ratio < 5 / 7 ? 'yellow' : 'green'
  return { text: `${sum}/${max} days on target`, tone }
}

export function gradeCheckin(s) {
  // red    not submitted — the client owes it
  // yellow submitted, unreviewed — the coach owes it
  // green  reviewed — the loop is closed
  if (!s?.checkIn) return { text: 'No check-in', tone: 'red' }
  if (!s.checkIn.reviewed_at) return { text: 'Awaiting your review', tone: 'yellow' }
  return { text: 'Reviewed', tone: 'green' }
}

// Attention = the worst of the three, and the reasons are every non-green
// dimension, worst first. Any dimension can reach red, so a client who logs
// faithfully but hits nothing, or whose check-in period is closing empty, ranks
// with the clients who stopped logging — which is the point.
export function attentionLevel(stats) {
  if (!stats) return { level: 'green', tone: 'green', reasons: [] }

  const graded = [gradeLogging(stats), gradeCompliance(stats), gradeCheckin(stats)]
    .sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone])

  const worst = graded[0]
  const reasons = graded.filter(g => g.tone !== 'green').map(g => g.text)
  // Carry the winning grade's fix through, so Attention can offer it too.
  // 'setup' still RANKS as yellow so it does not sink to the bottom with the
  // greens; only its colour differs.
  const level = worst.tone === 'green' ? 'green' : worst.tone === 'setup' ? 'yellow' : worst.tone
  return { level, tone: worst.tone, reasons, fix: worst.fix }
}

// Sort comparator: red first, then yellow, then green. Within a level, more
// reasons (more things wrong) ranks higher.
// Ordered by TONE, not level. `level` collapses grey into yellow (so a setup gap
// still counts as needing review in the rollup), which meant the roster sorted a
// grey and a yellow as equals and fell through to the reason count. Tone keeps
// them apart: red, then grey, then yellow, then green.
export function compareByAttention(sa, sb) {
  const a = attentionLevel(sa)
  const b = attentionLevel(sb)
  const byTone = TONE_RANK[a.tone] - TONE_RANK[b.tone]
  if (byTone !== 0) return byTone
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
