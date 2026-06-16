import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'

// Small inline "i" affordance that reveals a plain-language explanation on
// hover (desktop) or tap/focus (touch). The bubble is portaled to <body> and
// positioned from the icon's rect, so it escapes any ancestor `overflow:hidden`
// (e.g. the collapsible SectionHeader, which was clipping the top-row tips).
export default function InfoTip({ text }) {
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
  function hide() { setPos(null) }

  return (
    <span
      ref={markRef}
      className="info-tip"
      tabIndex={0}
      role="note"
      aria-label={text}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span className="info-tip-mark" aria-hidden="true">i</span>
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
