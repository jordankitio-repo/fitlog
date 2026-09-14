// The ONE input/control style for the whole app.
//
// Before this existed, ~11 screens had each grown their own `inputStyle` object
// and they had drifted badly: three different backgrounds (--color-bg,
// --color-surface, --color-surface-2), two border colours, five paddings
// (6/8/9/10px vertical) and two font sizes — for the same control. Inputs are
// the most-touched element in a logging app, so that divergence was one of the
// loudest "assembled, not designed" signals in the UI.
//
// Inline-styled call sites import this; <Field> (./Field.jsx) is the component
// form for labelled/validated fields. It lives in its own module so Field.jsx
// exports only components and Fast Refresh keeps working.
export const controlStyle = {
  backgroundColor: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)',
  padding: '10px 12px',
  color: 'var(--color-text)',
  fontSize: 'var(--text-base)',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
}
