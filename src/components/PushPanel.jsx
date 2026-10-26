import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './ui'

// A page PUSHED over the current one, the way a row with a chevron opens on an
// iPhone: it slides in from the right while the page under it slides a third
// of the way left, and going back plays that in reverse. A chevron promises
// exactly this; a sheet rising from the bottom (what All reports did) is the
// answer to a different gesture.
//
// The page under it stays mounted and untouched, so going back finds it where
// it was. It sits between the app's top bar and its tab bar, which both stay,
// as a pushed screen does inside an iOS tab.
//
// Back is the ‹ button, the back gesture (history), or a swipe from the left
// edge, which drags the page with the finger and lets go past a third of the
// width. `under` is the selector of the element to shift beneath it.
const EXIT_MS = 320
const EDGE_PX = 28
const CURVE = 'cubic-bezier(0.32, 0.72, 0, 1)'

// Inline offsets for a drag in progress; '' hands the element back to its
// classes.
function place(node, transition, transform) {
  if (!node) return
  node.style.transition = transition
  node.style.transform = transform
}

// `title` is the page's large title. Leave it out when the content names
// itself (a report's own subject), and pass `label` for the region instead.
export default function PushPanel({ open, title, label, backLabel = 'Back', onBack, under, id, children }) {
  const [shown, setShown] = useState(open)
  const [closing, setClosing] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) { setShown(true); setClosing(false) } else if (shown) setClosing(true)
  }
  useEffect(() => {
    if (!closing) return
    const t = setTimeout(() => { setShown(false); setClosing(false) }, EXIT_MS)
    return () => clearTimeout(t)
  }, [closing])

  // The page beneath moves while this one is on screen (and back as soon as
  // it starts to leave, so the two travel together).
  useEffect(() => {
    const el = under && document.querySelector(under)
    if (!el) return
    el.classList.add('push-under')
    el.classList.toggle('is-covered', open)
    // A finished edge swipe left inline offsets behind; the class owns it now.
    if (!open) place(el, '', '')
    return undefined
  }, [open, under, shown])
  useEffect(() => () => {
    const el = under && document.querySelector(under)
    if (el) el.classList.remove('is-covered')
  }, [under])

  // Edge swipe. The drag writes the offset straight to the DOM rather than
  // through state, so a finger is followed at the frame rate.
  const panelRef = useRef(null)
  const drag = useRef(null)
  const setOffset = (px, animate) => {
    const panel = panelRef.current
    const el = under && document.querySelector(under)
    const width = panel?.offsetWidth || 1
    place(panel, animate ? `transform ${EXIT_MS}ms ${CURVE}` : 'none', px ? `translateX(${px}px)` : '')
    place(el, animate ? '' : 'none', px ? `translateX(${-30 * (1 - px / width)}%)` : '')
  }
  const onTouchStart = (e) => {
    const t = e.touches[0]
    if (t.clientX > EDGE_PX || closing) return
    drag.current = { x: t.clientX, y: t.clientY, dx: 0, t: Date.now(), locked: false }
  }
  const onTouchMove = (e) => {
    const d = drag.current
    if (!d) return
    const t = e.touches[0]
    const dx = t.clientX - d.x
    // A vertical start is a scroll, not a swipe back.
    if (!d.locked && Math.abs(t.clientY - d.y) > Math.abs(dx)) { drag.current = null; return }
    const next = { ...d, locked: true, dx: Math.max(0, dx) }
    drag.current = next
    setOffset(next.dx, false)
  }
  const onTouchEnd = () => {
    const d = drag.current
    drag.current = null
    if (!d || !d.locked) return
    const width = panelRef.current?.offsetWidth || 1
    const fast = d.dx / Math.max(1, Date.now() - d.t) > 0.5
    if (d.dx > width / 3 || (fast && d.dx > 40)) {
      // Finish the slide from where the finger left it, then go back.
      setOffset(width, true)
      // Already off screen: the exit animation must not replay from zero.
      setTimeout(() => { panelRef.current?.setAttribute('data-gone', ''); onBack() }, EXIT_MS)
    } else {
      setOffset(0, true)
    }
  }

  if (!shown) return null
  return createPortal(
    <div
      ref={panelRef}
      id={id}
      className={`push-panel${closing ? ' push-closing' : ''}`}
      role="region"
      aria-label={title || label}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div className="push-panel-head">
        <button type="button" className="push-back ds-control" onClick={onBack}>
          <Icon name="left" size={20} strokeWidth={2.25} />
          <span>{backLabel}</span>
        </button>
        {title && <h1 className="push-title">{title}</h1>}
      </div>
      <div className="push-panel-body">{children}</div>
    </div>,
    // Inside #root, not on <body>: in the iPhone app #root is the scroller and
    // its own stacking context, so a panel on <body> painted over the tab bar
    // whatever the z-indexes said. Beside the bars it layers between them.
    document.getElementById('root') || document.body,
  )
}
