import { useState } from 'react'
import Modal from './Modal'
import { Icon } from './ui'
import { parseLocalDateString, toLocalDateString } from '../utils/dateHelpers'

// Picking a date for a photo comparison: a field that opens a month calendar
// where only the days WITH photos can be chosen (a dot under each), the rest
// greyed out. A dropdown of dates said nothing about when they were, how far
// apart, or how often; a calendar shows the rhythm at a glance, which is how
// a coach chooses a fair before and after.
//
// `dates`: every date with photos (YYYY-MM-DD, any order). The arrows step to
// the previous / next month that has any, never to an empty one.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
// "Oct 13"; the year only when it is not this one, so the field fits a phone.
const fieldLabel = (iso) => {
  const d = parseLocalDateString(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
}
const monthKey = (iso) => iso.slice(0, 7)

export default function PhotoDatePicker({ label, value, dates, onChange }) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(monthKey(value))
  const available = new Set(dates)
  const months = [...new Set(dates.map(monthKey))].sort()
  const at = months.indexOf(month)
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const daysIn = new Date(y, m, 0).getDate()
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)]
  const today = toLocalDateString(new Date())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', minWidth: 0 }}>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>{label}</span>
      <button type="button" className="ds-control pdp-field" onClick={() => { setMonth(monthKey(value)); setOpen(true) }}
        aria-haspopup="dialog" aria-label={`${label}: ${fieldLabel(value)}. Choose a date`}>
        <Icon name="calendar" size={15} style={{ color: 'var(--color-muted)' }} />
        <span className="tnum" style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fieldLabel(value)}</span>
        <Icon name="down" size={14} style={{ color: 'var(--color-muted)' }} />
      </button>
      <Modal open={open} title={label} onClose={() => setOpen(false)} maxWidth={360} sheet>
        <div className="pdp">
          <div className="pdp-head">
            <button type="button" className="ds-control pdp-nav" aria-label="Previous month with photos" disabled={at <= 0} onClick={() => setMonth(months[at - 1])}><Icon name="left" size={16} /></button>
            <span style={{ fontWeight: 'var(--weight-semibold)' }}>{MONTHS[m - 1]} {y}</span>
            <button type="button" className="ds-control pdp-nav" aria-label="Next month with photos" disabled={at < 0 || at >= months.length - 1} onClick={() => setMonth(months[at + 1])}><Icon name="right" size={16} /></button>
          </div>
          <div className="pdp-grid" role="grid" aria-label={`${MONTHS[m - 1]} ${y}`}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="pdp-dow" aria-hidden="true">{d}</span>)}
            {cells.map((d, i) => {
              if (d == null) return <span key={`e${i}`} />
              const iso = `${month}-${String(d).padStart(2, '0')}`
              const has = available.has(iso)
              const chosen = iso === value
              return (
                <button key={iso} type="button" disabled={!has}
                  className={`pdp-day ds-control${has ? ' has' : ''}${chosen ? ' chosen' : ''}${iso === today ? ' today' : ''}`}
                  aria-pressed={chosen}
                  aria-label={`${fieldLabel(iso)}${has ? ', has photos' : ', no photos'}`}
                  onClick={() => { onChange(iso); setOpen(false) }}>
                  {d}
                </button>
              )
            })}
          </div>
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>Days with photos are marked.</p>
        </div>
      </Modal>
    </div>
  )
}
