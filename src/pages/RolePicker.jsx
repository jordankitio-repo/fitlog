import { useCallback, useState } from 'react'
import { supabase } from '../supabase'
import Button from '../components/Button'
import Logo from '../components/Logo'
import { controlStyle, Icon } from '../components/ui'
import { isNativeApp } from '../utils/platform'

// Signing up as a coach inside the iOS app is a trap: the role gate in App.jsx
// sends every coach to CoachOnWeb, so picking it here creates an account and
// then immediately refuses to let you use it. On native there is one role, so
// the chooser has nothing to choose and does not render.
//
// Self-signup itself STAYS, deliberately. Apple rejects apps that cannot be
// used at all without an account obtained somewhere else, and an invite-only
// app is exactly that. A free Individual signup is the answer to that question
// at review time, so it has to keep working here.
const ROLES = isNativeApp() ? ['solo'] : ['solo', 'coach']

function RolePicker({ session, onComplete, onCancel }) {
  const userId = session.user.id
  const userEmail = session.user.email
  const metadataFullName = session.user.user_metadata?.full_name

  const [role, setRole] = useState('solo')
  const [fullName, setFullName] = useState(
    metadataFullName || ''
  )
  const [loading, setLoading] = useState(false)

  const confirm = useCallback(async (roleToUse) => {
    setLoading(true)
    const name = metadataFullName || fullName
    await supabase.from('profiles').upsert({
      id: userId,
      email: userEmail,
      role: roleToUse,
      full_name: name,
    })
    await supabase.auth.refreshSession()
    onComplete()
    setLoading(false)
  }, [fullName, metadataFullName, onComplete, userEmail, userId])

  // One canonical control style for the whole app (src/components/ui/Field.jsx).
  const inputStyle = controlStyle

  return (
    <div style={{ maxWidth: '400px', margin: '80px auto', display: 'flex', flexDirection: 'column', gap: '24px', padding: '0 16px' }}>
      <div>
        <Logo size={40} />
        <h1 style={{ marginTop: '16px' }}>Welcome to Gardnr</h1>
        <p style={{ color: 'var(--color-muted)', marginTop: '8px' }}>Tell us a bit about yourself to get started.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)' }}>Your name</p>
        <input
          type="text"
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          style={inputStyle}
        />
      </div>

      {ROLES.length > 1 && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)' }}>I am a...</p>
        <div style={{ display: 'flex', gap: '8px' }}>
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 'var(--radius)',
                border: role === r ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                backgroundColor: role === r ? '#1a2a3a' : 'var(--color-surface)',
                color: role === r ? 'var(--color-primary)' : 'var(--color-muted)',
                cursor: 'pointer',
                fontWeight: role === r ? 600 : 400,
                fontSize: 'var(--text-base)'
              }}
            >
              {r === 'solo' ? 'Individual' : 'Coach'}
            </button>
          ))}
        </div>
        {role === 'coach' && (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
            You'll be able to invite and manage clients from your dashboard.
          </p>
        )}
      </div>
      )}

      <Button onClick={() => confirm(role)} variant="primary" fullWidth loading={loading}>
        Get started
      </Button>
      <button
        type="button"
        onClick={onCancel}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--color-muted)',
          cursor: 'pointer',
          fontSize: 'var(--text-base)',
          textDecoration: 'underline'
        }}
      >
        <Icon name="left" /> Back
      </button>
    </div>
  )
}

export default RolePicker
