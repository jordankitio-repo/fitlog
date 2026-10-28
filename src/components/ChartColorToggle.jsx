import Switch from './ui/Switch'

// The switch that turns a chart's target-colouring on/off. "On" = coloured by
// target (default); off = plain metric colour. ui/Switch stops the click, so
// it never collapses the section whose header it sits in.
//
// It says what it does. It was a bare switch with only a hover title, so on a
// phone (no hover) a coach met an unlabelled switch in a chart header and had
// to flip it to find out. The visible words are the accessible name too.
export default function ChartColorToggle({ plain, onToggle }) {
  const on = !plain
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-6)' }}>
      <span aria-hidden="true" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>By target</span>
      <Switch checked={on} onChange={onToggle} label="Colour bars by target"
        title={on ? 'Switch to plain colors' : 'Color bars by target'} />
    </span>
  )
}
