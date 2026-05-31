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
      padding: '0 16px',
      display: 'flex',
      gap: '16px',
      alignItems: 'center',
      height: '56px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <span style={{ fontWeight: 700, color: 'var(--color-primary)', marginRight: 'auto', whiteSpace: 'nowrap' }}>
        FitLog
      </span>

      {profile?.role === 'coach' ? (
        <>
          <Link to="/" style={{ color: 'var(--color-text)', textDecoration: 'none', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>Clients</Link>
          <Link to="/profile" style={{ color: 'var(--color-text)', textDecoration: 'none', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>Profile</Link>
        </>
      ) : (
        <>
          <Link to="/" style={{ color: 'var(--color-text)', textDecoration: 'none', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>Dashboard</Link>
          <Link to="/log" style={{ color: 'var(--color-text)', textDecoration: 'none', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>Log</Link>
          <Link to="/profile" style={{ color: 'var(--color-text)', textDecoration: 'none', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>Profile</Link>
        </>
      )}

      <button
        onClick={handleSignOut}
        style={{
          backgroundColor: 'transparent',
          color: 'var(--color-muted)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: '6px 10px',
          cursor: 'pointer',
          fontSize: '0.8rem',
          whiteSpace: 'nowrap'
        }}
      >
        Sign out
      </button>
    </nav>
  )
}

export default NavBar
