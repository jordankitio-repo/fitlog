import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from '../hooks/useMediaQuery'

// Small inline "i" affordance that reveals a plain-language explanation on
// hover (desktop) or tap/focus (touch). The bubble is portaled to <body> and
// positioned from the icon's rect, so it escapes any ancestor `overflow:hidden`
// (e.g. the collapsible SectionHeader, which was clipping the top-row tips).
//
// Pass the label as children and the LABEL becomes the trigger:
//
//   <InfoTip text="How far back to read">Window</InfoTip>
//
// On a phone the mark is then dropped entirely. Six of these in one panel is
// six extra glyphs competing with the numbers they annotate, and on a 110px
// cell the mark was the thing that pushed a label onto two lines. The label
// carries no underline either: the tip is there for whoever presses the word.
// On a desktop the mark stays, because hover has no affordance of its own and
// the pointer needs a target.
//
// The width lives here rather than at each call site: one rule, not one per
// label, so a new tip cannot forget it.
export default function InfoTip({ text, children }) {
  const compact = useMediaQuery('(max-width: 600px)')
  const labelled = Boolean(children)
  const markRef = useRef(null)
  const [pos, setPos] = useState(null) // { top, left } in viewport coords, or null = hidden

  function show() {
    const r = markRef.current?.getBoundingClientRect()
    if (!r) return
    // The bubble is centered on the icon (translateX -50%, max-width 300). Clamp
    // its center so it never runs off either edge of the viewport.
    const HALF = 150
    const M = 8
    const center = r.left + r.width / 2
    const left = Math.max(HALF + M, Math.min(center, window.innerWidth - HALF - M))
    setPos({ top: r.top - 8, left })
  }
  // Leaving with the pointer must not close a tip the reader OPENED.
  //
  // Hover and focus both called this, so a tip you clicked vanished the moment
  // the pointer drifted off the word — which reads as the click not having
  // worked. Hover is a peek and closes when you look away; a click is a
  // request and stays until you click elsewhere, which fires onBlur. Both
  // paths still end here, so nothing leaks: once blurred, activeElement has
  // moved on and a later mouseleave closes normally.
  function hide({ force = false } = {}) {
    if (!force && markRef.current && document.activeElement === markRef.current) return
    setPos(null)
  }

  return (
    <span
      ref={markRef}
      className={`info-tip${labelled ? ' info-tip-labelled' : ''}`}
      tabIndex={0}
      role="note"
      aria-label={text}
      onMouseEnter={show}
      onMouseLeave={() => hide()}
      onFocus={show}
      onBlur={() => hide({ force: true })}
    >
      {children}
      {(!labelled || !compact) && <span className="info-tip-mark" aria-hidden="true">i</span>}
      {pos && createPortal(
        <span
          className="info-tip-bubble"
          style={{ top: pos.top, left: pos.left, transform: 'translate(-50%, -100%)' }}
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  )
}
