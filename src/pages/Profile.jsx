import { supabase } from '../supabase'

function Profile({ session }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h1>Profile</h1>

      <div style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div>
          <p style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Email</p>
          <p style={{ color: 'var(--color-text)', fontSize: '1rem' }}>{session.user.email}</p>
        </div>

        <div>
          <p style={{ fontSize: '0.75rem', marginBottom: '4px' }}>User ID</p>
          <p style={{ color: 'var(--color-text)', fontSize: '0.875rem', fontFamily: 'monospace' }}>{session.user.id}</p>
        </div>

        <div>
          <p style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Member since</p>
          <p style={{ color: 'var(--color-text)', fontSize: '1rem' }}>
            {new Date(session.user.created_at).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric'
            })}
          </p>
        </div>
      </div>
    </div>
  )
}

export default Profile