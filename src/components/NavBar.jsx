import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import Button from './Button'
import FeedbackButton from './FeedbackButton'

function NavBar({ profile }) {
  const location = useLocation()

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  function linkStyle(path) {
    const active = location.pathname === path
    return {
      color: active ? 'var(--color-text)' : 'var(--color-muted)',
      textDecoration: 'none',
      fontSize: 'var(--text-sm)',
      fontWeight: active ? 600 : 400,
      whiteSpace: 'nowrap',
      transition: 'color 0.15s ease',
    }
  }


  return (
    <nav style={{
      backgroundColor: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-border)',
      padding: '8px 16px',
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px 16px',
      alignItems: 'center',
      minHeight: '56px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <Link to="/" style={{
        fontWeight: 700,
        fontSize: '1rem',
        color: 'var(--color-primary)',
        letterSpacing: '-0.02em',
        whiteSpace: 'nowrap',
        textDecoration: 'none',
      }}>
        Gardnr
      </Link>

      {/* Right cluster: stays right-aligned on desktop, wraps to its own line(s)
          on narrow screens so Sign out is never pushed off-screen. */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px 16px',
        marginLeft: 'auto',
      }}>
        {profile?.role === 'coach' ? (
          <>
            <Link to="/" style={linkStyle('/')}>Clients</Link>
            <Link to="/profile" style={linkStyle('/profile')}>Profile</Link>
          </>
        ) : (
          <>
            <Link to="/" style={linkStyle('/')}>Dashboard</Link>
            <Link to="/log" style={linkStyle('/log')}>Log</Link>
            <Link to="/profile" style={linkStyle('/profile')}>Profile</Link>
          </>
        )}

        <FeedbackButton
          userEmail={profile?.email || ''}
          userName={profile?.full_name || ''}
        />

        <Button onClick={handleSignOut} variant="muted" size="sm">
          Sign out
        </Button>
      </div>
    </nav>
  )
}

export default NavBar
