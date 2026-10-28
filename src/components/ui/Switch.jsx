// The app's one on/off switch: 44x24 track, 20px knob, green on, grey off.
//
// Every switch renders this. There were three: Toggle's, a hand-rolled copy
// for "Hide calories from client" (identical only by luck), and the charts'
// "By target" at 32x18, shrunk to sit lighter in a section header, which made
// it the one odd switch out. One size everywhere, like the chips; if a switch
// looks heavy beside a heading, the fix is in the heading or the spacing.
//
// `onChange` receives no argument (callers flip their own state). Clicks stop
// here, so a switch inside a collapsible header never folds the section.
export default function Switch({ checked, onChange, label, disabled = false, title, style }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onChange() }}
      style={{
        width: '44px',
        height: '24px',
        padding: 0,
        borderRadius: '999px',
        border: 'none',
        backgroundColor: checked ? 'var(--color-primary)' : 'var(--color-border)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        position: 'relative',
        transition: 'background-color 0.2s',
        flexShrink: 0,
        display: 'block',
        ...style,
      }}
    >
      <span style={{
        position: 'absolute',
        top: '2px',
        left: checked ? '22px' : '2px',
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        backgroundColor: 'var(--color-on-accent)',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
        transition: 'left 0.2s',
      }} />
    </button>
  )
}
