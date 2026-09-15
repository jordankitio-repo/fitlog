import Button from '../Button'

// Selectable chip — the View lenses, and any slot/cadence toggle.
//
// It IS a Button: `muted` when inactive, `primary` when selected. Hand-rolling
// it meant maintaining a parallel copy, and it drifted — the inactive chip kept
// brightening its border on hover long after that was removed from every other
// control. Overriding the SHAPE is fine; rebuilding the control is not.
export default function Pill({ active = false, style, children, ...rest }) {
  return (
    <Button
      variant={active ? 'primary' : 'muted'}
      size="sm"
      style={{
        borderRadius: '999px',
        // Chips sit above a dense table and should not weigh as much as the
        // row controls; the type scale is the only thing held back from Button.
        // Everything else — padding, height, hover, press — comes from Button,
        // so a chip is exactly as tall as the Open/Nudge buttons below it. The
        // lighter type alone would leave it 4px short, hence the explicit floor.
        fontSize: 'var(--text-xs)',
        minHeight: '30px',
        ...style,
      }}
      {...rest}
    >
      {children}
    </Button>
  )
}
