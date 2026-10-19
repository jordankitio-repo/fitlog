// A labelled on/off switch: label (and optional description) on the left, the
// switch on the right.
//
// It was hand-rolled inline in Profile's Charts panel — 44x24 track, 20px knob,
// two transitions, the whole recipe sitting in the middle of a map(). Adding
// the notification preferences would have made that two copies of it, and a
// hand-rolled copy is not wrong on the day it is written; it is wrong on the
// day the original changes. Both call sites render this now, so the switch can
// only look like itself.
//
// The row shape is the one ChatGPT's settings use and the one 7.3 of the
// settings roadmap wants everywhere: label left, control right, description in
// a quieter line underneath. It is deliberately NOT a `Button` — Button is for
// a control you press to DO something, and this one reports a state.
export default function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: description ? 'flex-start' : 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-16)',
      padding: 'var(--space-6) 0',
    }}>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)' }}>{label}</span>
        {description && (
          <p style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-muted)',
            margin: '2px 0 0',
            lineHeight: 1.5,
          }}>
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        onClick={() => !disabled && onChange()}
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        style={{
          width: '44px',
          height: '24px',
          borderRadius: '999px',
          border: 'none',
          backgroundColor: checked ? 'var(--color-primary)' : 'var(--color-border)',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          position: 'relative',
          transition: 'background-color 0.2s',
          flexShrink: 0,
          // The switch sits on the label's first line when a description pushes
          // the row taller, rather than floating in the middle of two lines.
          marginTop: description ? '2px' : 0,
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
          transition: 'left 0.2s',
        }} />
      </button>
    </div>
  )
}
