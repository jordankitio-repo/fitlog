import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import Button from './Button'
import FeedbackButton from './FeedbackButton'

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}

function MenuIcon({ open }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {open ? (
        <>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </>
      ) : (
        <>
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </>
      )}
    </svg>
  )
}

function NavBar({ profile }) {
  const location = useLocation()
  const isMobile = useMediaQuery('(max-width: 600px)')
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  const links = profile?.role === 'coach'
    ? [{ to: '/', label: 'Clients' }, { to: '/profile', label: 'Profile' }]
    : [{ to: '/', label: 'Dashboard' }, { to: '/log', label: 'Log' }, { to: '/profile', label: 'Profile' }]

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

  const brand = (
    <Link to="/" onClick={() => setMenuOpen(false)} style={{
      fontWeight: 700,
      fontSize: '1rem',
      color: 'var(--color-primary)',
      letterSpacing: '-0.02em',
      whiteSpace: 'nowrap',
      textDecoration: 'none',
    }}>
      Gardnr
    </Link>
  )

  const navBase = {
    backgroundColor: 'var(--color-surface)',
    borderBottom: '1px solid var(--color-border)',
    padding: '0 16px',
    display: 'flex',
    alignItems: 'center',
    height: '56px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  }

  // ---- Mobile: brand + hamburger, dropdown panel ----
  if (isMobile) {
    return (
      <nav style={{ ...navBase, justifyContent: 'space-between', position: 'sticky' }}>
        {brand}
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '40px', height: '40px', padding: 0, margin: 0,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text)',
          }}
        >
          <MenuIcon open={menuOpen} />
        </button>

        {menuOpen && (
          <>
            {/* tap-away overlay */}
            <div
              onClick={() => setMenuOpen(false)}
              style={{ position: 'fixed', inset: '56px 0 0 0', zIndex: 90 }}
            />
            <div style={{
              position: 'absolute',
              top: '100%', left: 0, right: 0,
              backgroundColor: 'var(--color-surface)',
              borderBottom: '1px solid var(--color-border)',
              boxShadow: '0 10px 20px rgba(0,0,0,0.35)',
              display: 'flex', flexDirection: 'column',
              padding: '6px 0',
              zIndex: 95,
            }}>
              {links.map((l) => {
                const active = location.pathname === l.to
                return (
                  <Link
                    key={l.to + l.label}
                    to={l.to}
                    onClick={() => setMenuOpen(false)}
                    style={{
                      padding: '14px 20px',
                      color: active ? 'var(--color-text)' : 'var(--color-muted)',
                      fontWeight: active ? 600 : 400,
                      fontSize: 'var(--text-md)',
                      textDecoration: 'none',
                      backgroundColor: active ? 'var(--color-bg)' : 'transparent',
                    }}
                  >
                    {l.label}
                  </Link>
                )
              })}

              <div style={{ borderTop: '1px solid var(--color-border)', margin: '6px 0' }} />

              <div style={{ display: 'flex', gap: '12px', padding: '8px 20px 12px' }}>
                <FeedbackButton userEmail={profile?.email || ''} userName={profile?.full_name || ''} />
                <Button onClick={handleSignOut} variant="muted" size="sm">Sign out</Button>
              </div>
            </div>
          </>
        )}
      </nav>
    )
  }

  // ---- Desktop: full horizontal bar ----
  return (
    <nav style={{ ...navBase, gap: '24px' }}>
      {brand}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginLeft: 'auto' }}>
        {links.map((l) => (
          <Link key={l.to + l.label} to={l.to} style={linkStyle(l.to)}>{l.label}</Link>
        ))}
        <FeedbackButton userEmail={profile?.email || ''} userName={profile?.full_name || ''} />
        <Button onClick={handleSignOut} variant="muted" size="sm">Sign out</Button>
      </div>
    </nav>
  )
}

export default NavBar
