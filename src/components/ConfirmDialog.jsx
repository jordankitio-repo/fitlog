import { createPortal } from 'react-dom'
import { cardStyle } from '../utils/styles'
import Button from './Button'

// Branded confirm / notice modal — the on-brand replacement for window.confirm
// and window.alert. Centered card over a dimmed, blurred backdrop.
// Props: { open, title?, message, confirmLabel?, cancelLabel?, danger?,
//          onConfirm, onCancel }. Omit cancelLabel for a single-button notice.
export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, onConfirm, onCancel,
}) {
  if (!open) return null
  const isConfirm = Boolean(cancelLabel && onCancel)
  return createPortal(
    <div
      onClick={isConfirm ? onCancel : onConfirm}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 4000, padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ ...cardStyle, maxWidth: 380, width: '100%', padding: 20, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)' }}
      >
        {title && <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{title}</h3>}
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-muted)', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {isConfirm && <Button onClick={onCancel} variant="muted" size="sm">{cancelLabel}</Button>}
          <Button onClick={onConfirm} variant={danger ? 'danger-solid' : 'primary'} size="sm">{confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
