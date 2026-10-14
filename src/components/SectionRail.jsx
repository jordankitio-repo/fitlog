import { SECTION_ICONS } from '../utils/sectionIcons'

// Sticky in-page navigation for a long, section-heavy page (the coach's
// ClientView and the Profile page). Lists the page's sections in their live
// order; clicking jumps (and expands) the section, and the active one is
// highlighted via scroll-spy. Hidden on narrow viewports (see .cv-rail in
// index.css) — desktop-only.


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
          {SECTION_ICONS[item.key] || null}
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
