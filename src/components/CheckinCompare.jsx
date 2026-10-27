import { useState } from 'react'
import Modal from './Modal'
import { Select } from './ui'
import { checkinRatings } from '../utils/checkinLookup'
import { formatAnswer } from '../utils/checkinQuestions'
import { parseLocalDateString } from '../utils/dateHelpers'
import { useCheckinWeekCells } from '../hooks/useCheckinWeekCells'

// Two check-ins side by side: Everfit's "compare responses", MyPTHub's
// week-over-week. Rows, not two stacked cards, so each answer sits level with
// its counterpart: the ratings, the period's numbers, then the written
// answers. `checkIns` is every loaded check-in, newest first.

// "Oct 18"; the year only when it is not this one, so the picker fits a phone.
const dayLabel = (iso) => {
  const d = parseLocalDateString(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
}

function texts(c) {
  if (!c) return []
  if (Array.isArray(c.answers) && c.answers.length > 0) {
    return c.answers.filter(a => a.type !== 'rating').map(a => ({ id: a.question_id || a.prompt, label: a.prompt, value: formatAnswer(a) }))
  }
  return [
    { id: 'obstacles', label: 'Obstacles', value: c.obstacles },
    { id: 'notes', label: 'Notes for coach', value: c.notes },
  ]
}

// Every row label across both, in the newer one's order, then the older's.
function union(a, b, pick) {
  const out = []
  for (const r of [...pick(b), ...pick(a)]) if (!out.some(x => x.id === r.id)) out.push(r)
  return out
}

function Row({ label, before, after, strong = false }) {
  return (
    <div className="cic-row">
      <span className="cic-label">{label}</span>
      {[before, after].map((v, i) => (
        <span key={i} className={`cic-cell tnum${strong ? ' is-strong' : ''}`}>{v == null || v === '' ? <span style={{ color: 'var(--color-faint)' }}>{'—'}</span> : v}</span>
      ))}
    </div>
  )
}

export default function CheckinCompare({ open, onClose, checkIns, clientId, intervalWeeks, weightUnit }) {
  const [aId, setAId] = useState(null) // before (older)
  const [bId, setBId] = useState(null) // after (newer)
  const b = checkIns.find(c => c.id === bId) || checkIns[0]
  const a = checkIns.find(c => c.id === aId) || checkIns[1] || null
  const weekA = useCheckinWeekCells(open && a ? clientId : null, a?.week_of, intervalWeeks, weightUnit)
  const weekB = useCheckinWeekCells(open && b ? clientId : null, b?.week_of, intervalWeeks, weightUnit)
  if (!b || !a) return null

  const pickSelect = (label, value, onChange) => (
    <Select className="select-sm" label={label} value={value} onChange={(e) => onChange(e.target.value)}
      style={{ width: '100%', padding: '6px 12px', fontSize: 'var(--text-sm)', minHeight: '30px', cursor: 'pointer' }}>
      {checkIns.map(c => <option key={c.id} value={c.id}>{dayLabel(c.week_of)}</option>)}
    </Select>
  )
  const ratingOf = (c, id) => checkinRatings(c).find(r => r.id === id)?.value
  const textOf = (c, id) => texts(c).find(t => t.id === id)?.value

  return (
    <Modal open={open} title="Compare check-ins" onClose={onClose} maxWidth={640} sheet tall>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
        <div className="cic-row" style={{ alignItems: 'end' }}>
          <span />
          {pickSelect('Before', a.id, setAId)}
          {pickSelect('After', b.id, setBId)}
        </div>
        <div>
          {union(a, b, checkinRatings).map(r => (
            <Row key={r.id} label={r.label} before={ratingOf(a, r.id) != null ? `${ratingOf(a, r.id)}/10` : null} after={ratingOf(b, r.id) != null ? `${ratingOf(b, r.id)}/10` : null} strong />
          ))}
          {(weekA || weekB) && (weekB || weekA).map((cell, i) => (
            <Row key={cell.label} label={cell.label}
              before={weekA ? [weekA[i].value, weekA[i].sub].filter(Boolean).join(' ') : null}
              after={weekB ? [weekB[i].value, weekB[i].sub].filter(Boolean).join(' ') : null} />
          ))}
        </div>
        {union(a, b, texts).filter(t => textOf(a, t.id) || textOf(b, t.id)).map(t => (
          <div key={t.id}>
            <p className="ds-colhead" style={{ margin: '0 0 var(--space-6)' }}>{t.label}</p>
            <div className="cic-texts">
              {[textOf(a, t.id), textOf(b, t.id)].map((v, i) => (
                <p key={i} style={{ margin: 0, fontSize: 'var(--text-base)', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: v ? 'var(--color-text)' : 'var(--color-faint)' }}>{v || '—'}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
