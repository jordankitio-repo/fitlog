import { attentionLevel, gradeLogging, gradeCompliance, gradeCheckin } from './attentionLevel'

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

export const LENS_HEADERS = {
  attention: 'Needs attention',
  compliance: 'Compliance',
  recent: 'Last logged',
  checkin: 'Check-in',
}

const LENS_GRADERS = {
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
