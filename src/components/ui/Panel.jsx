// Surface level 2 of 3 — see docs/design-system.md.
//
// The ONLY element in the app that draws a border. A Panel never contains a
// Panel: nesting depth is capped at 1. Before this rule, ~70% of every bordered
// surface in the app sat inside another bordered surface, because drawing a box
// was the only way the codebase knew how to say "these things belong together".
//
// `density` is the whole padding vocabulary. Two values, no third:
//   compact      repeating surfaces — rosters, stat rows, lists
//   comfortable  things people type into or read — forms, settings, prose
//
// `flush` drops the body padding for panels whose children are <Row>s, since a
// Row carries its own.
const DENSITY = {
  compact:     { body: 'var(--space-12) var(--space-16)', head: 'var(--space-10) var(--space-16)' },
  comfortable: { body: 'var(--space-20) var(--space-24)', head: 'var(--space-12) var(--space-24)' },
}

export default function Panel({
  title,
  action,
  density = 'comfortable',
  flush = false,
  as: Tag = 'section',
  style,
  headingLevel: H = 'h2',
  children,
  ...rest
}) {
  const d = DENSITY[density] ?? DENSITY.comfortable
  return (
    <Tag
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
        ...style,
      }}
      {...rest}
    >
      {(title || action) && (
        <header
          style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            gap: 'var(--space-sm)', padding: d.head,
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          {title && (
            <H style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 'var(--weight-medium)', letterSpacing: '-0.005em' }}>
              {title}
            </H>
          )}
          {action}
        </header>
      )}
      <div style={flush ? undefined : { padding: d.body, display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {children}
      </div>
    </Tag>
  )
}
