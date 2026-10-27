// Small grey toggle switch to turn a chart's target-coloring on/off. "On" =
// colored by target (default); off = plain metric color. Stops click
// propagation so it doesn't collapse the section.
//
// It says what it does. It was a bare switch with only a hover title, so on a
// phone (no hover) a coach met an unlabelled switch in a chart header and had
// to flip it to find out. The visible words are the accessible name too.
export default function ChartColorToggle({ plain, onToggle }) {
  const on = !plain
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-6)' }}>
    <span aria-hidden="true" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>By target</span>
    <button
      aria-label="Colour bars by target"
      type="button"
      role="switch"
      aria-checked={on}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      title={on ? 'Switch to plain colors' : 'Color bars by target'}
      style={{
        width: '32px', height: '18px', borderRadius: '999px',
        border: '1px solid var(--color-border)',
        background: on ? '#4d4d4d' : 'var(--color-bg)',
        position: 'relative', cursor: 'pointer', padding: 0, flexShrink: 0,
        transition: 'background-color 0.2s ease',
      }}
    >
      <span style={{
        position: 'absolute', top: '2px', left: on ? '15px' : '2px',
        width: '12px', height: '12px', borderRadius: '50%',
        background: 'linear-gradient(180deg, #ffffff, #d6d6d6)',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.45)',
        transition: 'left 0.2s ease',
      }} />
    </button>
    </span>
  )
}
