// Sticky in-page navigation for a long, section-heavy page (the coach's
// ClientView). Lists the page's sections in their live order; clicking jumps
// (and expands) the section, and the active one is highlighted via scroll-spy.
// Hidden on narrow viewports (see .cv-rail in index.css) — desktop-only.
export default function SectionRail({ sections, activeKey, onJump, label = 'On this client' }) {
  if (!sections.length) return null
  return (
    <nav className="cv-rail" aria-label="Sections">
      <p style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-faint)', fontWeight: 600, margin: '0 0 12px 10px' }}>
        {label}
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {sections.map((s) => {
          const active = s.key === activeKey
          return (
            <li key={s.key}>
              <button
                onClick={() => onJump(s.key)}
                className={`cv-rail-item${active ? ' is-active' : ''}`}
              >
                {s.key === 'messages' && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: '7px' }}>
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                )}
                {s.label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
