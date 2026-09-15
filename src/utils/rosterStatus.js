import { attentionLevel } from './attentionLevel'

// What the roster's status column shows, per lens.
//
// The sort chips are LENSES, not just sort orders: picking one re-sorts the
// roster AND changes what the status column reports, so the column always shows
// the value the rows are ordered by. Before this, sorting by Compliance
// reordered the list while the column kept showing attention reasons — the
// coach was sorting by a number that was never on screen.
//
// It also fixes what that column was: under "Needs attention" it holds the most
// pressing fact of whatever kind, so two cells answer different questions. Under
// any other lens every cell answers the SAME question and the column is finally
// comparable top to bottom.
//
// Tone follows the house rule — colour is a grade, grey means no grade exists.

// A metric counts as weak below this many days on target out of 7 (matches
// attentionLevel's own threshold).
const WEAK = 3

function logText(days) {
  if (days === null || days === undefined) return 'Never logged'
  if (days === 0) return 'Logged today'
  if (days === 1) return 'Logged yesterday'
  return `${days} days ago`
}

function logTone(days) {
  if (days === null || days === undefined) return 'red'
  if (days >= 4) return 'red'
  if (days >= 2) return 'yellow'
  return 'green'
}

export const LENS_HEADERS = {
  attention: 'Needs attention',
  compliance: 'Compliance',
  recent: 'Last logged',
  checkin: 'Check-in',
}

export function rosterStatus(lens, s) {
  if (!s) return { text: '—', tone: 'setup' }

  if (lens === 'compliance') {
    const items = (s.complianceItems || []).filter(i => i.hasData)
    // No targets, or targets but nothing logged against them: there is no
    // compliance to report, so there is no grade to give.
    if (!(s.complianceItems || []).length) return { text: 'No targets set', tone: 'setup' }
    if (!items.length) return { text: 'Nothing logged', tone: 'setup' }
    const sum = items.reduce((t, i) => t + i.value, 0)
    const max = items.length * 7
    const ratio = sum / max
    const tone = ratio >= 5 / 7 ? 'green' : ratio >= WEAK / 7 ? 'yellow' : 'red'
    return { text: `${sum}/${max} days on target`, tone }
  }

  if (lens === 'recent') {
    return { text: logText(s.daysSinceLog), tone: logTone(s.daysSinceLog) }
  }

  if (lens === 'checkin') {
    if (!s.checkIn) return { text: 'Not submitted', tone: 'yellow' }
    // Submitted but unreviewed is the COACH's outstanding work, not the
    // client's — amber because it is on their list, not because anyone slipped.
    if (!s.checkIn.reviewed_at) return { text: 'Awaiting your review', tone: 'yellow' }
    return { text: 'Reviewed', tone: 'green' }
  }

  // Default lens: the single most pressing fact, of whatever kind.
  const t = attentionLevel(s)
  return {
    text: t.level === 'green' ? logText(s.daysSinceLog) : t.reasons[0],
    tone: t.tone,
    title: t.reasons.length > 1 ? t.reasons.join(' · ') : undefined,
  }
}
