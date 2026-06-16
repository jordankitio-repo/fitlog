import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cardStyle } from '../utils/styles'

// Branded content modal: a centered tile over a dimmed, blurred backdrop, with
// a header (title + ✕) and a scrollable body. Dismiss via backdrop, ✕, or Esc.
// Keeps long content (e.g. saved meals) off the page so it never stretches it.
export default function Modal({ open, title, onClose, children, maxWidth = 520 }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 4000, padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ ...cardStyle, maxWidth, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--color-muted)', fontSize: '1.1rem', cursor: 'pointer', padding: 4, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
