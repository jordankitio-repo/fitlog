import { useMediaQuery } from '../../hooks/useMediaQuery'

// One setting: what it is on the left, the control for it on the right.
//
// This shape was written five separate times before it was a component —
// Toggle's switch rows, "Sign out everywhere", "Export", "Delete account", and
// the Appearance choices — and the copies had already drifted on the one thing
// a reader actually notices. Toggle labelled its rows at `--text-base` and the
// hand-written ones used `--text-sm` with a raw `fontWeight: 600`, so the same
// kind of line was two sizes and two weights depending on which section you
// were looking at. None of them was wrong on its own; they were only wrong
// together, which is the failure mode a primitive exists to prevent.
//
// A5 settles which one wins: a row's primary line is `--text-base` /
// `--weight-medium`, and its secondary is `--text-sm` muted. Weight is the
// weakest of the three hierarchy signals, so the label leans on size and
// colour and spends 500, not 600.
//
// `stacked` puts the control UNDER the text instead of beside it. That is for
// a control too wide to sit on the right — a row of three Pills — where
// forcing it right either squeezes the label or wraps the pills into a ragged
// second column. The header treatment is the thing being standardised here;
// where the control physically sits is a width question, and pretending
// otherwise is how a primitive starts fighting its call sites.
export default function SettingRow({
  label,
  description,
  children,
  stacked = false,
  keepInline = false,
  tone,
}) {
  // F1: a row is REBUILT at phone width, not reflowed. A button beside a
  // description takes ~280px of a 390px screen, which squeezed "Download all
  // your logged data..." into a four-line ribbon next to a button with room to
  // spare. Below 600px the control moves under the text and both get the full
  // width.
  //
  // `keepInline` is for a control narrow enough that stacking makes it worse:
  // a 44px switch under its own label reads as a stray object, where beside it
  // it reads as the row's answer. Toggle is the only caller.
  const narrow = useMediaQuery('(max-width: 600px)')
  const stackIt = stacked || (narrow && !keepInline)
  const labelColor = tone === 'danger' ? 'var(--color-error)' : 'var(--color-text)'

  const text = (
    <div style={{ minWidth: 0 }}>
      <p style={{
        fontSize: 'var(--text-base)',
        fontWeight: 'var(--weight-medium)',
        color: labelColor,
        margin: 0,
      }}>
        {label}
      </p>
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
  )

  if (stackIt) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)', padding: 'var(--space-6) 0' }}>
        {text}
        {children}
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      // Top, not centre: a two-line description would otherwise push the
      // control into the gap between the lines, which reads as misaligned
      // rather than centred.
      alignItems: description ? 'flex-start' : 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-16)',
      padding: 'var(--space-6) 0',
    }}>
      {text}
      {children && <div style={{ flexShrink: 0 }}>{children}</div>}
    </div>
  )
}
