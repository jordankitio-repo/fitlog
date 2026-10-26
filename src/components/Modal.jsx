import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cardStyle } from '../utils/styles'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { Icon } from './ui'

// Branded content modal: a centered tile over a dimmed, blurred backdrop, with
// a header (title + ✕) and a scrollable body. Dismiss via backdrop, ✕, or Esc.
// Keeps long content (e.g. saved meals) off the page so it never stretches it.
//
// `sheet` takes the notifications' frame instead (.sheet-backdrop and
// .sheet-panel): on a phone it rises from the bottom edge, full width, the
// way an iOS sheet does; on a desktop it is still the centred tile.
export default function Modal({ open, title, onClose, children, maxWidth = 520, sheet = false }) {
  // Focus trap + Esc + focus restore (a11y); the hook owns Esc now.
  const dialogRef = useFocusTrap(open, onClose)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
      <h3 style={{ margin: 0, fontSize: 'var(--text-subhead)' }}>{title}</h3>
      <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}><Icon name="x" size={18} /></button>
    </div>
  )
  if (sheet) {
    return createPortal(
      <div className="sheet-backdrop" role="presentation" onClick={onClose}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className="sheet-panel modal-sheet"
          style={{ '--sheet-max': `${maxWidth}px` }}
        >
          {header}
          <div className="modal-sheet-body">{children}</div>
        </div>
      </div>,
      document.body,
    )
  }
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{ ...cardStyle, maxWidth, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)' }}
      >
        {header}
        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
