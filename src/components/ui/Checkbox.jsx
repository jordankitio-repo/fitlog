import Icon from './Icon'

// A checkbox with its sentence, the whole row pressable.
//
// The browser's own box was the one undesigned control on the screens that
// matter most for trust -- the Apple Health consents and the sign-up age gate
// -- a 16px OS square beside designed type. This keeps the real input (so
// keyboard, screen readers and form semantics are untouched) and draws the box
// over it: a raised control surface at rest, the brand green when ticked, with
// the app's own check glyph.
//
// The row is at least 44px tall, Apple's minimum touch target, and the label
// text is part of it: a consent is agreed to by tapping the sentence, not by
// hunting for a 16px square.
//
// `small` is for a box that sits under a form as its fine print (the sign-up
// age gate): the sentence drops to --text-sm muted, the box and the tap target
// stay the same size.
export default function Checkbox({ checked, onChange, children, disabled = false, small = false }) {
  return (
    <label className={`ds-checkrow${small ? ' is-small' : ''}${disabled ? ' is-disabled' : ''}`}>
      <input
        type="checkbox"
        className="ds-check-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={`ds-check${checked ? ' is-checked' : ''}`} aria-hidden="true">
        {checked && <Icon name="check" size={14} strokeWidth={2.5} />}
      </span>
      <span className="ds-checkrow-text">{children}</span>
    </label>
  )
}
