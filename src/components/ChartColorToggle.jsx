// Small header control to switch a chart between target-coloring and plain
// metric color. Stops click propagation so it doesn't collapse the section.
export default function ChartColorToggle({ plain, onToggle }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      title={plain ? 'Color bars by target' : 'Switch to plain colors'}
      style={{
        fontSize: '0.65rem', fontWeight: 600, padding: '3px 9px', borderRadius: '999px',
        border: '1px solid var(--color-border)', background: 'var(--color-bg)',
        color: 'var(--color-muted)', cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1.4,
      }}
    >
      {plain ? 'Color by target' : 'Plain colors'}
    </button>
  )
}
