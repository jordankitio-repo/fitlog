import { useState } from 'react'
import Modal from './Modal'
import Button from './Button'
import { Pill, Field, Icon, Checkbox } from './ui'
import { toLocalDateString } from '../utils/dateHelpers'
import { defaultPauseEnd } from '../utils/pause'

// The sheets a coach opens on ONE client — Pause and Groups — shared by the
// roster's ⋯ menu and the client record's. Two copies of a form that writes the
// same row drift the first time either changes; the roster review already
// learned that with CheckinReview.

const PAUSE_REASONS = ['Holiday', 'Injury', 'Illness', 'Other']

// `name` is the client's full name; `onSave(until, reason)` does the write and
// resolves true when it stuck, so a failure leaves the sheet open.
export function PauseSheet({ open, name, onClose, onSave }) {
  const [until, setUntil] = useState(defaultPauseEnd)
  const [reason, setReason] = useState('Holiday')
  const [saving, setSaving] = useState(false)
  // Fresh defaults each time it opens, not whatever the last client got. Reset
  // while rendering (React's "adjusting state when a prop changes"), not in an
  // effect, so the sheet never paints a frame with the old values.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) { setUntil(defaultPauseEnd()); setReason('Holiday') }
  }

  return (
    <Modal open={open} title={`Pause ${name?.split(' ')[0] || 'client'}`} onClose={onClose} maxWidth={420} sheet>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
        <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
          No grades, nudges or check-in reminders until then, and their progress view stays open. Coaching resumes by itself.
        </p>
        <Field label="Until" type="date" value={until} min={toLocalDateString(new Date())} onChange={(e) => setUntil(e.target.value)} />
        <div>
          <p style={{ margin: '0 0 var(--space-6)', fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>Reason</p>
          <div style={{ display: 'flex', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
            {PAUSE_REASONS.map(r => <Pill key={r} active={reason === r} aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</Pill>)}
          </div>
        </div>
        <Button variant="primary" loading={saving} disabled={!until || saving} onClick={async () => {
          setSaving(true)
          await onSave(until, reason)
          setSaving(false)
        }}>Pause coaching</Button>
      </div>
    </Modal>
  )
}

// `api` is useCoachGroups' return; `clientId` the client being labelled.
export function GroupsSheet({ open, clientId, api, onClose, onDeleted }) {
  const [newGroup, setNewGroup] = useState('')
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) { setWasOpen(open); if (open) setNewGroup('') }
  const add = async () => { if (await api.createGroup(newGroup, clientId)) setNewGroup('') }

  return (
    <Modal open={open} title="Groups" onClose={onClose} maxWidth={420} sheet>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
        {api.groups.length === 0 && (
          <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>Label clients to filter the list and message them together, like "Online" or "In person".</p>
        )}
        {api.groups.map(g => {
          const on = api.members.some(m => m.group_id === g.id && m.client_id === clientId)
          return (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
              <div style={{ flex: 1 }}><Checkbox checked={on} onChange={(v) => api.toggleMember(g.id, clientId, v)}>{g.name}</Checkbox></div>
              <Button variant="ghost" size="sm" ariaLabel={`Delete group ${g.name}`} onClick={async () => { if (await api.deleteGroup(g)) onDeleted?.(g) }}><Icon name="trash" /></Button>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 'var(--space-8)' }}>
          <Field placeholder="New group" aria-label="New group" value={newGroup} maxLength={40}
            onChange={(e) => setNewGroup(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            style={{ flex: 1, width: 'auto' }} />
          <Button variant="muted" size="md" onClick={add} disabled={!newGroup.trim()}>Add</Button>
        </div>
      </div>
    </Modal>
  )
}
