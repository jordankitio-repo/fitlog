import { Link } from 'react-router-dom'
import { supabase } from '../supabase'

function NavBar({ profile }) {
  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <nav style={{
      backgroundColor: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-border)',
      padding: '0 24px',
      display: 'flex',
      gap: '24px',
      alignItems: 'center',
      height: '56px'
    }}>
      <span style={{ fontWeight: 700, color: 'var(--color-primary)', marginRight: 'auto' }}>
        FitLog
      </span>

      {profile?.role === 'coach' ? (
        <>
          <Link to="/" style={{ color: 'var(--color-text)', textDecoration: 'none' }}>Clients</Link>
          <Link to="/profile" style={{ color: 'var(--color-text)', textDecoration: 'none' }}>Profile</Link>
        </>
      ) : (
        <>
          <Link to="/" style={{ color: 'var(--color-text)', textDecoration: 'none' }}>Dashboard</Link>
          <Link to="/log" style={{ color: 'var(--color-text)', textDecoration: 'none' }}>Log</Link>
          <Link to="/profile" style={{ color: 'var(--color-text)', textDecoration: 'none' }}>Profile</Link>
        </>
      )}

      <button
        onClick={handleSignOut}
        style={{
          backgroundColor: 'transparent',
          color: 'var(--color-muted)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: '6px 14px',
          cursor: 'pointer',
          fontSize: '0.875rem'
        }}
      >
        Sign out
      </button>
    </nav>
  )
}

export default NavBar