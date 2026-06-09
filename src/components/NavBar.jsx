import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import Button from './Button'
import Logo from './Logo'
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

function BurgerIcon({ open }) {
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

function NavIcon({ label }) {
  const p = { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, className: 'gnav-mitem-icon' }
  switch (label) {
    case 'Dashboard':
      return (<svg {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>)
    case 'Log':
      return (<svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>)
    case 'Clients':
      return (<svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>)
    case 'Profile':
    default:
      return (<svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>)
  }
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

  const brand = (
    <Link to="/" aria-label="Gardnr home" onClick={() => setMenuOpen(false)} style={{
      display: 'inline-flex', alignItems: 'center', gap: '9px', textDecoration: 'none',
    }}>
      <Logo size={26} />
      <span style={{
        fontWeight: 700, fontSize: '1.05rem', color: 'var(--color-primary)',
        letterSpacing: '-0.02em', whiteSpace: 'nowrap',
      }}>Gardnr</span>
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

  // ---- Mobile: brand + hamburger, animated dropdown ----
  if (isMobile) {
    return (
      <nav className="gnav" style={{ ...navBase, justifyContent: 'space-between' }}>
        {brand}
        <button
          type="button"
          className="gnav-burger"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          <BurgerIcon open={menuOpen} />
        </button>

        {menuOpen && (
          <>
            <div
              className="gnav-backdrop"
              onClick={() => setMenuOpen(false)}
              style={{
                position: 'fixed', inset: '56px 0 0 0', zIndex: 90,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
              }}
            />
            <div
              className="gnav-panel"
              style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                backgroundColor: 'var(--color-surface)',
                borderBottom: '1px solid var(--color-border)',
                boxShadow: '0 14px 28px rgba(0, 0, 0, 0.4)',
                display: 'flex', flexDirection: 'column',
                padding: '6px 0',
                zIndex: 95,
              }}
            >
              {links.map((l) => (
                <Link
                  key={l.to + l.label}
                  to={l.to}
                  onClick={() => setMenuOpen(false)}
                  className={`gnav-mitem${location.pathname === l.to ? ' active' : ''}`}
                >
                  <NavIcon label={l.label} />
                  {l.label}
                </Link>
              ))}

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

  // ---- Desktop: full horizontal bar with pill links ----
  return (
    <nav className="gnav" style={{ ...navBase, gap: '24px' }}>
      {brand}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
        {links.map((l) => (
          <Link
            key={l.to + l.label}
            to={l.to}
            className={`gnav-link${location.pathname === l.to ? ' active' : ''}`}
          >
            {l.label}
          </Link>
        ))}
        <span style={{ width: '8px' }} />
        <FeedbackButton userEmail={profile?.email || ''} userName={profile?.full_name || ''} />
        <Button onClick={handleSignOut} variant="muted" size="sm">Sign out</Button>
      </div>
    </nav>
  )
}

export default NavBar
