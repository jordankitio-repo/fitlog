// Sticky in-page navigation for a long, section-heavy page (the coach's
// ClientView and the Profile page). Lists the page's sections in their live
// order; clicking jumps (and expands) the section, and the active one is
// highlighted via scroll-spy. Hidden on narrow viewports (see .cv-rail in
// index.css) — desktop-only.

// One line-icon per section key, shared across both rails so the same concept
// always reads the same. Feather-style: 24-viewBox, stroke, no fill.
const ICONS = {
  messages: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />,
  stats: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
  consistency: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
  sentReports: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>,
  targets: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>,
  details: <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" /></>,
  nutritionLog: <><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></>,
  checkIn: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
  privateNotes: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
  correlatedChart: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>,
  weightChart: <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></>,
  calorieChart: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  cardioChart: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />,
  stepsChart: <polyline points="4 20 8 20 8 15 12 15 12 10 16 10 16 5 20 5" />,
  account: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  appearance: <><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></>,
  questionnaire: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
  billing: <><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></>,
  soloBilling: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
  security: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  data: <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></>,
  charts: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></>,
  // The coach-client relationship itself, not the client's data — the section
  // that ends the engagement. Two figures, because that is what it is about.
  coaching: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  measurements: <><rect x="2" y="9" width="20" height="6" rx="1" /><line x1="6" y1="9" x2="6" y2="12" /><line x1="10" y1="9" x2="10" y2="12" /><line x1="14" y1="9" x2="14" y2="12" /><line x1="18" y1="9" x2="18" y2="12" /></>,
}

// A rail row. `meta` is the optional right-hand value — a count, or a short
// status word. It is what turns a column of 13 identical links into something
// worth the width it occupies: the coach can see there are 2 unread messages
// and a check-in due without scrolling to either section.
function RailItem({ item, active, onJump }) {
  return (
    <li>
      <button
        onClick={() => onJump(item.key)}
        className={`cv-rail-item ds-control${active ? ' is-active' : ''}`}
        aria-current={active ? 'true' : undefined}
      >
        {/* Fixed 16px icon slot so labels align even if a key lacks a glyph. */}
        <svg className="cv-rail-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {ICONS[item.key] || null}
        </svg>
        <span className="cv-rail-label">{item.label}</span>
        {item.meta != null && (
          <span className="cv-rail-meta" data-tone={item.metaTone || 'muted'}>{item.meta}</span>
        )}
      </button>
    </li>
  )
}

// `groups` is [{ label, items, pin }]. A group with no label renders its items
// with no header, which is how the top group (Messages) sits above the page
// sections without announcing itself. `pin: 'bottom'` drops the group to the
// foot of the rail behind a rule, so the column fills its full height instead
// of trailing off into dead space halfway down.
export default function SectionRail({ sections, groups, activeKey, onJump, onBack, backLabel = 'Back', footer, label = 'On this page' }) {
  const resolved = groups ?? (sections?.length ? [{ label, items: sections }] : [])
  if (!resolved.some(g => g.items.length)) return null
  // `footer` is reference content, not navigation — it renders after the nav
  // groups and before anything pinned, and takes the column's slack so the
  // rail's empty middle carries something worth reading instead of nothing.
  const nav = resolved.filter(g => g.pin !== 'bottom')
  const pinned = resolved.filter(g => g.pin === 'bottom')
  return (
    <nav className="cv-rail" aria-label="Sections">
      {/* The way out sits at the head of the rail, where Cloudflare parks its
          account switcher — the one control above the rule that leaves this
          page entirely, rather than floating loose over the header. */}
      {onBack && (
        <div className="cv-rail-head">
        <button type="button" className="cv-rail-back ds-control" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {backLabel}
        </button>
        </div>
      )}
      {nav.map((g, i) => (
        g.items.length ? (
          <div key={g.label || `g${i}`} className={`cv-rail-group${g.pin === 'bottom' ? ' is-pinned' : ''}`}>
            {g.label && <p className="cv-rail-grouplabel">{g.label}</p>}
            <ul className="cv-rail-list">
              {g.items.map((item) => (
                <RailItem key={item.key} item={item} active={item.key === activeKey} onJump={onJump} />
              ))}
            </ul>
          </div>
        ) : null
      ))}
      {footer && <div className="cv-rail-footer">{footer}</div>}
      {pinned.map((g, i) => (
        g.items.length ? (
          <div key={g.label || `p${i}`} className="cv-rail-group is-pinned">
            {g.label && <p className="cv-rail-grouplabel">{g.label}</p>}
            <ul className="cv-rail-list">
              {g.items.map((item) => (
                <RailItem key={item.key} item={item} active={item.key === activeKey} onJump={onJump} />
              ))}
            </ul>
          </div>
        ) : null
      ))}
    </nav>
  )
}
