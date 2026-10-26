import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Avatar from './Avatar'
import Button from './Button'
import { controlStyle, Icon, SettingRow } from './ui'
import { uploadAvatar, removeAvatar, AVATAR_MAX_BYTES } from '../utils/avatarUpload'

const divider = { height: '1px', backgroundColor: 'var(--color-border)' }
const muted = { fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: 0, lineHeight: 1.5 }

// Who reads the name, said on the name itself. A client's coach and a
// coach's clients are the only other people who ever see it.
const NAME_AUDIENCE = {
  client: 'Your coach sees this name.',
  coach: 'Your clients see this name.',
}

// Supabase's error codes, as a person would want them said.
function emailErrorText(error) {
  const code = error?.code || ''
  if (code === 'email_exists' || /already (been )?registered/i.test(error?.message || '')) {
    return 'That email is already used by another account.'
  }
  if (code.includes('rate_limit')) return 'Too many attempts. Try again in a few minutes.'
  if (code === 'email_address_invalid') return 'Enter a valid email address.'
  return 'Could not start the change. Try again.'
}

// Profile > Account, as settings rows (7.3), the shape every other settings
// page uses. It was a form of stacked uppercase labels, which the design
// system reserves for column heads, and it read as the one page built
// differently from its neighbours.
//
// What an account page carries, by the market's measure (Apple, Google,
// Strava, MyFitnessPal): who you are (photo, name), how you sign in (email,
// changeable), and, on a coaching app, who else can see you -- the coach. Not
// "Account type: Client", which is the system's word for the reader.
export default function AccountSettings({ session, profile, onProfileUpdate }) {
  const navigate = useNavigate()
  const role = profile?.role
  const email = session.user.email

  // --- Photo -----------------------------------------------------------------
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '')
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const avatarInputRef = useRef(null)

  async function onPickAvatar(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the user re-pick the same file later
    if (!file) return
    setAvatarError('')
    if (!file.type.startsWith('image/')) { setAvatarError('Please choose an image file.'); return }
    if (file.size > AVATAR_MAX_BYTES) { setAvatarError('Image must be under 5 MB.'); return }
    setAvatarBusy(true)
    try {
      const url = await uploadAvatar(session.user.id, file)
      const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', session.user.id)
      if (error) throw error
      setAvatarUrl(url)
      onProfileUpdate?.()
    } catch (err) {
      console.error('avatar upload:', err)
      setAvatarError(err.message || 'Upload failed. Try again.')
    } finally {
      setAvatarBusy(false)
    }
  }

  async function onRemoveAvatar() {
    setAvatarBusy(true)
    setAvatarError('')
    try {
      await removeAvatar(session.user.id)
      const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', session.user.id)
      if (error) throw error
      setAvatarUrl('')
      onProfileUpdate?.()
    } catch (err) {
      console.error('avatar remove:', err)
      setAvatarError('Could not remove. Try again.')
    } finally {
      setAvatarBusy(false)
    }
  }

  // --- Name ------------------------------------------------------------------
  const profileName = profile?.full_name || ''
  const [name, setName] = useState(profileName)
  const [syncedName, setSyncedName] = useState(profileName)
  const [nameSaved, setNameSaved] = useState(false)
  const [nameSaving, setNameSaving] = useState(false)
  const [nameOpen, setNameOpen] = useState(false)
  // Follow the profile when it (re)loads -- "adjust state during render",
  // which avoids a setState in an effect.
  if (profileName !== syncedName) {
    setSyncedName(profileName)
    setName(profileName)
  }
  const nameDirty = name.trim() !== '' && name.trim() !== profileName

  async function saveName() {
    const trimmed = name.trim()
    if (!trimmed) return
    setNameSaving(true)
    const { error } = await supabase.from('profiles').update({ full_name: trimmed }).eq('id', session.user.id)
    setNameSaving(false)
    if (error) { console.error('Error saving name:', error); return }
    setNameSaved(true)
    setNameOpen(false)
    setTimeout(() => setNameSaved(false), 2000)
    onProfileUpdate?.()
  }

  // --- Email -----------------------------------------------------------------
  // Supabase confirms an email change by link, and by default from BOTH
  // addresses ("secure email change"), so the copy says both. The change only
  // happens once confirmed; until then the client signs in with the old one,
  // which is why the pending address is shown rather than swapped in.
  const [emailOpen, setEmailOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [pendingEmail, setPendingEmail] = useState(session.user.new_email || '')

  async function requestEmailChange() {
    const next = newEmail.trim().toLowerCase()
    setEmailError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) { setEmailError('Enter a valid email address.'); return }
    if (next === email.toLowerCase()) { setEmailError('That is already your email.'); return }
    setEmailBusy(true)
    const { error } = await supabase.auth.updateUser({ email: next })
    setEmailBusy(false)
    if (error) { console.error('email change:', error); setEmailError(emailErrorText(error)); return }
    setPendingEmail(next)
    setEmailOpen(false)
    setNewEmail('')
  }

  // --- Coach (clients) -------------------------------------------------------
  // Who else sees this account's data. `undefined` while loading, so the row
  // does not flash "No coach" before the answer arrives.
  const [coachName, setCoachName] = useState(undefined)
  useEffect(() => {
    if (role !== 'client') return
    supabase.from('coach_clients').select('coach_id')
      .eq('client_id', session.user.id).eq('status', 'active').maybeSingle()
      .then(({ data: rel }) => rel
        ? supabase.from('profiles').select('full_name').eq('id', rel.coach_id).maybeSingle()
          .then(({ data }) => setCoachName(data?.full_name || 'Your coach'))
        : setCoachName(null))
  }, [role, session.user.id])

  const since = new Date(session.user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <>
      {/* Who you are. The photo IS the control, the way account pages do it:
          tap it to change it, with a pencil so the reader knows it can be. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-16)' }}>
        <input ref={avatarInputRef} type="file" accept="image/*" onChange={onPickAvatar} style={{ display: 'none' }} />
        <button
          type="button"
          className="ds-control ds-avatar-edit"
          onClick={() => avatarInputRef.current?.click()}
          disabled={avatarBusy}
          aria-label={avatarUrl ? 'Change photo' : 'Add a photo'}
        >
          <Avatar url={avatarUrl} name={profileName} size={64} />
          <span className="ds-avatar-edit-badge" aria-hidden="true"><Icon name="pencil" size={12} strokeWidth={2} /></span>
        </button>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 'var(--weight-medium)', color: 'var(--color-text)' }}>
            {profileName || 'Your name'}
          </p>
          <p style={muted}>Member since {since}</p>
          {avatarUrl && (
            <button type="button" className="ds-control ds-fixbtn" onClick={onRemoveAvatar} disabled={avatarBusy}
              style={{ fontSize: 'var(--text-sm)', padding: 0, marginTop: 'var(--space-2)' }}>
              Remove photo
            </button>
          )}
          {avatarError && <p style={{ ...muted, color: 'var(--color-error)' }}>{avatarError}</p>}
        </div>
      </div>

      <div style={divider} />

      {/* The name is already the header's headline, so this row does not
          repeat it in an always-open box. It edits on request, the way
          Email does and the way Apple's account page does. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
        <SettingRow keepInline label="Name" description={nameSaved ? 'Saved.' : NAME_AUDIENCE[role]}>
          {!nameOpen && (
            <Button variant="muted" size="sm" onClick={() => { setName(profileName); setNameOpen(true) }}>Edit</Button>
          )}
        </SettingRow>
        {nameOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
            <input
              type="text"
              aria-label="Name"
              placeholder="Your name"
              autoComplete="name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={controlStyle}
            />
            <div style={{ display: 'flex', gap: 'var(--space-12)' }}>
              <Button variant="primary" size="sm" onClick={saveName} loading={nameSaving} disabled={!nameDirty}>Save</Button>
              <Button variant="ghost" size="sm" onClick={() => { setNameOpen(false); setName(profileName) }}>Cancel</Button>
            </div>
          </div>
        )}
      </div>

      <div style={divider} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
        <SettingRow
          keepInline
          label="Email"
          description={email}
        >
          {!emailOpen && (
            <Button variant="muted" size="sm" onClick={() => { setEmailOpen(true); setEmailError('') }}>Change</Button>
          )}
        </SettingRow>
        {/* Full width, not squeezed beside the button: the address is the
            part the reader needs whole. */}
        {pendingEmail && !emailOpen && (
          <p style={muted}>Changing to {pendingEmail}. Confirm in both inboxes to finish.</p>
        )}
        {emailOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
            <input
              type="email"
              aria-label="New email"
              placeholder="New email"
              autoComplete="email"
              inputMode="email"
              autoFocus
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              style={controlStyle}
            />
            <p style={muted}>
              We&apos;ll email a confirmation link to the new address and to {email}. The change happens once both are confirmed.
            </p>
            {emailError && <p style={{ ...muted, color: 'var(--color-error)' }}>{emailError}</p>}
            <div style={{ display: 'flex', gap: 'var(--space-12)' }}>
              <Button variant="primary" size="sm" onClick={requestEmailChange} loading={emailBusy} disabled={!newEmail.trim()}>
                Send confirmation
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setEmailOpen(false); setNewEmail(''); setEmailError('') }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {role === 'client' && coachName !== undefined && (
        <>
          <div style={divider} />
          {/* Who else sees this account. The answer a client most wants on a
              health app, and the one "Account type: Client" never gave. */}
          <SettingRow
            keepInline
            label="Coach"
            description={coachName || 'Not connected to a coach.'}
          >
            {coachName && <Button variant="muted" size="sm" onClick={() => navigate('/coach')}>Message</Button>}
          </SettingRow>
        </>
      )}
    </>
  )
}
