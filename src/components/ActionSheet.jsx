import { useEffect, useRef, useState } from 'react'
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
//
// IT ANIMATES, in and out. It used to appear and vanish in one frame, which
// read as a glitch rather than a sheet: the backdrop now fades and the panel
// rises (on a phone; it scales on a desktop), and on close it plays that back
// before unmounting. Reduced motion is honoured by the global rule.
//
// IT IGNORES THE FINGER THAT OPENED IT. A hold opens this while the finger is
// still down (the way iOS opens a context menu), so the lift of that finger
// would otherwise land as a click on whatever is under it -- the backdrop,
// closing the sheet at once, or an action. Only a press that STARTS inside
// the sheet after it opened counts. A keyboard click (detail 0) has no press
// and always counts.
const EXIT_MS = 200

export default function ActionSheet({ open, title, actions = [], onClose }) {
  const dialogRef = useFocusTrap(open, onClose, { focusContainer: true })
  // Kept on screen through the exit animation: the last content shown and
  // whether it is closing. Tracked against the previous `open` during render
  // (React's pattern for state that follows a prop), and the unmount after
  // the exit is the only thing left to an effect.
  const [shown, setShown] = useState(open ? { title, actions } : null)
  const [closing, setClosing] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  const armed = useRef(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) { setShown({ title, actions }); setClosing(false) }
    else if (shown) setClosing(true)
  }
  useEffect(() => {
    if (open) { armed.current = false; return }
    if (!closing) return
    const t = setTimeout(() => { setShown(null); setClosing(false) }, EXIT_MS)
    return () => clearTimeout(t)
  }, [open, closing])

  if (!shown) return null
  const counts = (e) => armed.current || e.detail === 0

  return createPortal(
    <div
      onPointerDown={() => { armed.current = true }}
      onClick={(e) => { if (counts(e)) onClose() }}
      className={`sheet-backdrop${closing ? ' sheet-closing' : ''}`}
      role="presentation"
    >
      <div
        ref={open ? dialogRef : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={shown.title || 'Actions'}
        className="sheet-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {shown.title && <p className="sheet-title">{shown.title}</p>}
        {shown.actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className={`sheet-action${a.destructive ? ' destructive' : ''}`}
            onClick={(e) => { if (!counts(e) || closing) return; onClose(); a.onSelect() }}
          >
            {a.icon && <Icon name={a.icon} size={18} />}
            <span>{a.label}</span>
          </button>
        ))}
        <button type="button" className="sheet-action cancel" onClick={(e) => { if (counts(e)) onClose() }}>Cancel</button>
      </div>
    </div>,
    document.body,
  )
}
