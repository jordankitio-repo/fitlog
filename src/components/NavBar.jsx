import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import Logo from './Logo'
import FeedbackButton from './FeedbackButton'
import NotificationCenter from './NotificationCenter'
import Avatar from './Avatar'
import { useMediaQuery } from '../hooks/useMediaQuery'

function NavIcon({ label, size = 19 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, className: 'gnav-mitem-icon' }
  switch (label) {
    // E1: the tab is "My Progress" now, so the mark is a trend line rather than
    // the 2x2 grid — that grid is the universal "dashboard" glyph, and it was
    // the icon half of the placeholder word the label just dropped.
    case 'My Progress':
      return (<svg {...p}><path d="M3 3v18h18" /><polyline points="7 14 11 10 14 13 20 7" /></svg>)
    case 'Coach':
      return (<svg {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>)
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

  // Flag the body while the fixed bottom tab bar is on screen so the app shell
  // can pad trailing content (and lift the chat FAB) clear of it. CSS owns the
  // sizing; this just announces the bar exists.
  useEffect(() => {
    if (!isMobile) return undefined
    document.body.classList.add('has-bottom-nav')
    return () => document.body.classList.remove('has-bottom-nav')
  }, [isMobile])

  // Desktop account menu (opens from the avatar): Profile + Sign out.
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  const links = profile?.role === 'coach'
    ? [{ to: '/', label: 'Clients' }, { to: '/profile', label: 'Profile' }]
    : [
        { to: '/', label: 'My Progress' },
        { to: '/log', label: 'Log' },
        // Everything from the coach, in one place. See pages/Coach.jsx.
        ...(profile?.role === 'client' ? [{ to: '/coach', label: 'Coach' }] : []),
        { to: '/profile', label: 'Profile' },
      ]

  // Desktop pill links: everything except Profile, which lives in the avatar menu.
  const navLinks = links.filter((l) => l.to !== '/profile')

  const brand = (
    <Link to="/" aria-label="Gardnr home" style={{
      display: 'inline-flex', alignItems: 'center', gap: '9px', textDecoration: 'none',
    }}>
      <Logo size={26} />
      <span style={{
        fontWeight: 700, fontSize: 'var(--text-subhead)', color: 'var(--color-primary)',
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

  // ---- Mobile: slim top bar (brand + alerts) + fixed bottom tab bar ----
  // Cronometer-style: primary navigation lives in a thumb-reachable bar pinned
  // to the bottom edge. Sign out / feedback move into the Profile tab.
  if (isMobile) {
    return (
      <>
        <nav className="gnav" style={{ ...navBase, justifyContent: 'space-between' }}>
          {brand}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <NotificationCenter profile={profile} />
            <Link to="/profile" aria-label="Your profile" style={{ display: 'inline-flex' }}>
              <Avatar url={profile?.avatar_url} name={profile?.full_name} size={30} />
            </Link>
          </div>
        </nav>
        <nav className="gnav-bottom" aria-label="Primary">
          {links.map((l) => {
            const active = l.to === '/'
              ? location.pathname === '/'
              : location.pathname === l.to || location.pathname.startsWith(l.to + '/')
            return (
              <Link
                key={l.to + l.label}
                to={l.to}
                className={`gnav-tab${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <span className="gnav-tab-pill">
                  <NavIcon label={l.label} size={22} />
                </span>
                <span className="gnav-tab-label">{l.label}</span>
              </Link>
            )
          })}
        </nav>
      </>
    )
  }

  // ---- Desktop: full horizontal bar with pill links ----
  return (
    <nav className="gnav" style={{ ...navBase, gap: '24px' }}>
      {brand}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
        {/* Profile lives in the avatar menu on desktop, not as a pill.
            And a single destination is not navigation: a coach has only
            Clients, which points at the page they are already on and which the
            brand mark already links to. Rendered only when there is somewhere
            to actually go — so clients keep My Progress/Log. */}
        {navLinks.length > 1 && navLinks.map((l) => (
          <Link
            key={l.to + l.label}
            to={l.to}
            className={`gnav-link${location.pathname === l.to ? ' active' : ''}`}
          >
            {l.label}
          </Link>
        ))}
        <NotificationCenter profile={profile} />
        <span style={{ width: '8px' }} />
        <FeedbackButton userEmail={profile?.email || ''} userName={profile?.full_name || ''} />

        <div style={{ position: 'relative', display: 'inline-flex', marginLeft: '4px' }}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Account menu"
            aria-expanded={menuOpen}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              borderRadius: '50%', display: 'inline-flex',
              boxShadow: location.pathname === '/profile' ? '0 0 0 2px var(--color-primary)' : 'none',
            }}
          >
            <Avatar url={profile?.avatar_url} name={profile?.full_name} size={34} />
          </button>

          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 110 }} />
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 10px)', width: 220, zIndex: 120,
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-dropdown)',
                overflow: 'hidden', padding: '6px',
              }}>
                <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--color-border)', marginBottom: '4px' }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.full_name || 'Your account'}</div>
                  {profile?.email && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.email}</div>}
                </div>
                <Link
                  to="/profile"
                  onClick={() => setMenuOpen(false)}
                  className={`gnav-menu-item${location.pathname === '/profile' ? ' active' : ''}`}
                >
                  Profile
                </Link>
                <div className="gnav-menu-sep" role="separator" />
                <button type="button" onClick={() => { setMenuOpen(false); handleSignOut() }} className="gnav-menu-item danger">
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}

export default NavBar
