import { useEffect } from 'react'
import { createPortal } from 'react-dom'

// `action` is an optional { label, onClick } — used for undo after a delete.
// A toast carrying an action gets longer on screen, because the user has to
// read it AND decide before it disappears.
function Toast({ message, type = 'success', onClose, action = null }) {
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(onClose, action ? 7000 : 3000)
    return () => clearTimeout(timer)
  }, [message, action, onClose])

  if (!message) return null

  // DELIBERATE LITERALS — do not tokenize. The toast is a self-contained
  // ALWAYS-DARK surface: its bg stays a deep tint (#064e3b/#450a0a/#052e16) on
  // both themes, so its foreground must stay the BRIGHT dark-mode accent.
  // Swapping these for --color-success/-error/-primary would flip the text to
  // the darkened light-mode values against a still-dark bg and kill contrast.
  /* eslint-disable no-restricted-syntax -- always-dark surface, see above */
  const colors = {
    success: { bg: '#064e3b', border: '#34d399', color: '#34d399' },
    error: { bg: '#450a0a', border: '#f87171', color: '#f87171' },
    info: { bg: '#052e16', border: '#22c55e', color: '#22c55e' },
  }
  /* eslint-enable no-restricted-syntax */

  const c = colors[type]

  // PORTALED to <body>, like ChatBubble's launcher and InfoTip's bubble, and
  // for the same family of reason: a fixed child is only as free as its
  // ancestors allow. Those two escape `overflow: hidden`; this one escapes a
  // STACKING CONTEXT, which is the quieter trap because nothing looks wrong in
  // the CSS. Pages render inside `.page-fade-in`, whose
  // `animation: fadeIn … forwards` animates OPACITY — and an element with an
  // opacity animation in effect creates a stacking context, which `forwards`
  // then keeps alive permanently. The toast's z-index was therefore scoped
  // INSIDE that context, which itself sits at z-index auto, below the bottom
  // nav's 100. zIndex: 1000 against the nav's 100 and the nav still won; no
  // value here could ever have fixed it. Measured: elementFromPoint over the
  // overlap returned A.gnav-tab.
  return createPortal((
    <div role="status" aria-live="polite" className="ds-toast" style={{
      // position / bottom / right live in CSS on .ds-toast, NOT here. Inline
      // styles beat stylesheet rules, so an offset set here cannot be moved by
      // the media query that lifts the toast clear of the mobile tab bar —
      // which is exactly what happened, and the fix is not to escalate to
      // !important but to stop holding the value where nothing can reach it.
      backgroundColor: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 'var(--radius)',
      padding: '12px 20px',
      color: c.color,
      fontWeight: 600,
      fontSize: 'var(--text-base)',
      zIndex: 1000,
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      animation: 'fadeIn 0.2s ease forwards',
      maxWidth: '320px',
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
    }}>
      <span>{message}</span>
      {action && (
        <button
          onClick={() => { action.onClick(); onClose() }}
          style={{
            background: 'none', border: 'none', padding: '4px 2px', cursor: 'pointer',
            color: 'inherit', font: 'inherit', fontWeight: 700,
            textDecoration: 'underline', textUnderlineOffset: '3px',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  ), document.body)
}

export default Toast
