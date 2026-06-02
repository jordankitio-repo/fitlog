import { useCallback, useState } from 'react'
import { supabase } from '../supabase'
import Button from '../components/Button'

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

  const inputStyle = {
    backgroundColor: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#f0f0f0',
    fontSize: '1rem',
    width: '100%'
  }

  return (
    <div style={{ maxWidth: '400px', margin: '80px auto', display: 'flex', flexDirection: 'column', gap: '24px', padding: '0 16px' }}>
      <div>
        <h1>Welcome to FitLog</h1>
        <p style={{ color: 'var(--color-muted)', marginTop: '8px' }}>Tell us a bit about yourself to get started.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>Your name</p>
        <input
          type="text"
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>I am a...</p>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['solo', 'coach'].map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                border: role === r ? '2px solid #4f8ef7' : '1px solid #2a2a2a',
                backgroundColor: role === r ? '#1a2a3a' : '#1a1a1a',
                color: role === r ? '#4f8ef7' : '#888',
                cursor: 'pointer',
                fontWeight: role === r ? 600 : 400,
                fontSize: '0.875rem'
              }}
            >
              {r === 'solo' ? '🧍 Individual' : '🏋️ Coach'}
            </button>
          ))}
        </div>
        {role === 'coach' && (
          <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
            You'll be able to invite and manage clients from your dashboard.
          </p>
        )}
      </div>

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
          fontSize: '0.875rem',
          textDecoration: 'underline'
        }}
      >
        ← Back
      </button>
    </div>
  )
}

export default RolePicker
