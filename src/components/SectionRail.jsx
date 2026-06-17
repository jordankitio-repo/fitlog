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
                {s.label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
