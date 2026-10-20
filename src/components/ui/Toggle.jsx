import SettingRow from './SettingRow'
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
// The row itself is `SettingRow` now, shared with every other setting on the
// page. This file owns the SWITCH and nothing else, which is the whole point:
// when Toggle drew its own label too, its rows and the hand-written ones beside
// them disagreed about type size and weight.
//
// Deliberately NOT a `Button` — Button is for a control you press to DO
// something, and this one reports a state.
export default function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <SettingRow label={label} description={description}>
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
          // Sits on the label's first line when a description makes the row
          // taller, rather than floating between two lines.
          marginTop: description ? '2px' : 0,
          display: 'block',
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
    </SettingRow>
  )
}
