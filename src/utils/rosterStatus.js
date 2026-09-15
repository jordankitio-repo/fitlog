import { attentionLevel, gradeLogging, gradeCompliance, gradeCheckin, TONE_RANK } from './attentionLevel'

// What the roster's status column shows, per lens.
//
// The chips are LENSES, not just sort orders: picking one re-sorts the roster
// AND retargets this column, so the column always reports the value the rows
// are ordered by. Before this, sorting by Compliance reordered the list while
// the column kept showing attention reasons — sorting by a number that was
// never on screen.
//
// Each lens renders ONE dimension's grade. Attention renders the WORST of the
// three, which is why it is the roll-up and not a fourth peer: if compliance is
// red for a client, Attention shows that red; if the only problem is a yellow
// check-in, Attention shows that yellow. It is built out of the same graders,
// so it cannot disagree with the lens a coach switches to.
//
// Tone follows the house rule — colour is a grade, grey means no grade exists.

// Sort order per lens. Almost every lens ranks by severity (TONE_RANK:
// red, yellow, setup, green). Compliance is the exception, and deliberately:
// grey goes ABOVE red.
//
// With a red you know the problem — the client is logging and missing targets,
// and you can coach them. With "No targets set" you can know NOTHING: that
// client could be the worst on the roster and nothing would show it. A blind
// spot outranks a known bad number. It is also a five-second admin fix that
// unblocks measurement, where 0/14 is a coaching conversation.
//
// This does NOT apply to Attention, where grey must stay below red — otherwise
// "you haven't finished onboarding Finn" would outrank "Hugo hasn't logged in
// five days", which is backwards for a triage screen.
const COMPLIANCE_RANK = { setup: 0, red: 1, yellow: 2, green: 3 }

export function lensToneRank(lens, tone) {
  const map = lens === 'compliance' ? COMPLIANCE_RANK : TONE_RANK
  return map[tone] ?? 99
}

export const LENS_HEADERS = {
  attention: 'Needs attention',
  compliance: 'Compliance',
  recent: 'Last logged',
  checkin: 'Check-in',
}

export const LENS_GRADERS = {
  compliance: gradeCompliance,
  recent: gradeLogging,
  checkin: gradeCheckin,
}

export function rosterStatus(lens, s) {
  if (!s) return { text: '\u2014', tone: 'setup' }

  const grade = LENS_GRADERS[lens]
  if (grade) return grade(s)

  // Attention: the worst dimension, with the rest behind a tooltip.
  const t = attentionLevel(s)
  if (t.level === 'green') return gradeLogging(s)
  return {
    text: t.reasons[0],
    tone: t.tone,
    title: t.reasons.length > 1 ? t.reasons.join(' \u00b7 ') : undefined,
  }
}
