function SectionHeader({ title, collapsed, onToggle, badge, badgeColor, children, animated = true }) {
  return (
    <>
      <div
        onClick={onToggle}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          {badge && (
            <span style={{ backgroundColor: badgeColor || 'var(--color-primary)', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: '999px' }}>{badge}</span>
          )}
        </div>
        <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>{collapsed ? '▶' : '▼'}</span>
      </div>
      {animated ? (
        <div style={{
          display: 'grid',
          gridTemplateRows: collapsed ? '0fr' : '1fr',
          transition: 'grid-template-rows 0.25s ease',
          overflow: 'hidden',
        }}>
          <div style={{ minHeight: 0 }}>{children}</div>
        </div>
      ) : (
        !collapsed && <div style={{ paddingTop: '8px' }}>{children}</div>
      )}
    </>
  )
}

export default SectionHeader
