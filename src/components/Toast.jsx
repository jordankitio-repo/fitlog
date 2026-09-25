import { useEffect } from 'react'

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

  return (
    <div role="status" aria-live="polite" style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
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
  )
}

export default Toast
