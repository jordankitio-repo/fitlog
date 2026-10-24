import { createPortal } from 'react-dom'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { Icon } from './ui'

// The menu a long press opens: a row's actions, as a list you read rather than
// a cluster of icons you decode.
//
// Bottom-anchored on a phone and centred on a desktop, which is the same split
// every platform makes -- a sheet is within thumb reach, and a centred tile is
// where a mouse already is. Same bones as Modal (portal, focus trap, Esc,
// backdrop dismiss) rather than a second dialog idiom.
//
// Actions are TEXT WITH A GLYPH, not glyphs alone. The whole point is that the
// four icons on a Daily Log row needed decoding; repeating them in a menu
// without their names would move the problem rather than solve it.
//
// `destructive` colours the label --color-error. No confirm step here: the
// callers that need one already own a ConfirmDialog, and a sheet that confirms
// inside itself would be two dialogs deep on a phone.
export default function ActionSheet({ open, title, actions = [], onClose }) {
  const dialogRef = useFocusTrap(open, onClose)
  if (!open) return null

  return createPortal(
    <div
      onClick={onClose}
      className="sheet-backdrop"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Actions'}
        className="sheet-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <p className="sheet-title">{title}</p>}
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className={`sheet-action${a.destructive ? ' destructive' : ''}`}
            onClick={() => { onClose(); a.onSelect() }}
          >
            {a.icon && <Icon name={a.icon} size={18} />}
            <span>{a.label}</span>
          </button>
        ))}
        <button type="button" className="sheet-action cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>,
    document.body,
  )
}
