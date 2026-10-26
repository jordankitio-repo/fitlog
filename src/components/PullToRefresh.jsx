import { useEffect, useRef, useState } from 'react'
import { isNativeApp } from '../utils/platform'

// Pull down from the top of a page, let go, and the page refreshes -- the
// gesture every iPhone app has. Native app only: in a browser the same pull
// already means "reload the page".
//
// WHY NOT UIRefreshControl. It attaches to the web view's own scroll view, and
// in the app that scroll view never moves: the shell hands scrolling to #root
// so the fixed bars stay fixed (see "Native shell" in index.css). So the
// gesture is read here, off #root, and #root's own rubber-band supplies the
// physics -- the content already follows the finger, and the indicator rides
// on top of the content into the gap the bounce opens. Nothing here moves the
// page during the pull, so it cannot fight the bounce.
//
// The pull is tracked through a ref and written straight to the indicator's
// style. A state update per touchmove would re-render on every frame of the
// gesture.
const THRESHOLD = 80     // finger travel, in px, that arms a refresh
const SLOT = 44          // the room held open while it runs
const MIN_SPIN_MS = 600  // a refresh that finishes instantly still reads as one
// A finger that rests before moving is a long press (the Log's row menu, or a
// drag to another meal), never a pull.
const HOLD_MS = 350
const SPOKES = 8

function Spinner({ spinning }) {
  return (
    <svg
      width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"
      className={spinning ? 'ptr-spinner ptr-spinning' : 'ptr-spinner'}
    >
      {Array.from({ length: SPOKES }, (_, i) => (
        <line
          key={i}
          x1="12" y1="2.5" x2="12" y2="7"
          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
          transform={`rotate(${i * (360 / SPOKES)} 12 12)`}
          className="ptr-spoke"
          // Each spoke a step fainter going anticlockwise from the brightest,
          // which is what makes a stepped clockwise rotation read as a wheel
          // turning rather than spokes blinking.
          style={{ '--spoke-opacity': 1 - ((SPOKES - i) % SPOKES) * (0.75 / SPOKES), '--spoke-i': i }}
        />
      ))}
    </svg>
  )
}

export default function PullToRefresh({ onRefresh, children }) {
  const enabled = isNativeApp()
  const wrapRef = useRef(null)
  const indicatorRef = useRef(null)
  const [refreshing, setRefreshing] = useState(false)
  const busy = useRef(false)
  const latest = useRef(onRefresh)
  useEffect(() => { latest.current = onRefresh })

  useEffect(() => {
    if (!enabled) return
    const wrap = wrapRef.current
    const scroller = document.getElementById('root')
    if (!wrap || !scroller) return

    let start = null // { x, y, t } while a pull may be under way
    let progress = 0

    // Spokes appear one by one as the finger travels, the way iOS's does, so
    // the reader can see how far is far enough before letting go.
    const paint = (p) => {
      const el = indicatorRef.current
      if (!el) return
      el.style.opacity = p > 0 ? String(Math.min(1, p * 1.5)) : ''
      el.style.setProperty('--ptr-shown', String(Math.round(p * SPOKES)))
    }

    const onStart = (e) => {
      if (busy.current || e.touches.length !== 1 || scroller.scrollTop > 0) { start = null; return }
      const t = e.touches[0]
      start = { x: t.clientX, y: t.clientY, t: Date.now() }
      progress = 0
    }
    const onMove = (e) => {
      if (!start) return
      const t = e.touches[0]
      const dy = t.clientY - start.y
      const dx = t.clientX - start.x
      if (progress === 0 && Math.abs(dy) > 6) {
        // Decided on the first real movement, once: sideways (a chip strip),
        // upward (a scroll), or after a rest (a long press) is not a pull.
        if (dy < 0 || Math.abs(dx) > Math.abs(dy) || Date.now() - start.t > HOLD_MS) {
          start = null
          paint(0)
          return
        }
      }
      if (scroller.scrollTop > 0) { start = null; paint(0); return }
      progress = Math.max(0, Math.min(1, dy / THRESHOLD))
      paint(progress)
    }
    const onEnd = () => {
      if (!start) return
      const armed = progress >= 1
      start = null
      progress = 0
      paint(0)
      if (!armed || busy.current) return
      busy.current = true
      setRefreshing(true)
      const began = Date.now()
      Promise.resolve()
        .then(() => latest.current?.())
        .catch(err => console.error('Pull to refresh failed:', err))
        .then(() => new Promise(r => setTimeout(r, Math.max(0, MIN_SPIN_MS - (Date.now() - began)))))
        .finally(() => { busy.current = false; setRefreshing(false) })
    }

    wrap.addEventListener('touchstart', onStart, { passive: true })
    wrap.addEventListener('touchmove', onMove, { passive: true })
    wrap.addEventListener('touchend', onEnd)
    wrap.addEventListener('touchcancel', onEnd)
    return () => {
      wrap.removeEventListener('touchstart', onStart)
      wrap.removeEventListener('touchmove', onMove)
      wrap.removeEventListener('touchend', onEnd)
      wrap.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled])

  if (!enabled) return children

  return (
    <div ref={wrapRef} className="ptr">
      {/* Zero tall at rest, so the indicator sits just ABOVE the page, under
          the top bar, until a pull uncovers it. While a refresh runs the slot
          opens and holds the page down around the spinning wheel. */}
      <div className="ptr-slot" style={{ height: refreshing ? SLOT : 0 }}>
        <div
          ref={indicatorRef}
          className={refreshing ? 'ptr-indicator ptr-active' : 'ptr-indicator'}
          style={{ height: SLOT }}
        >
          <Spinner spinning={refreshing} />
        </div>
      </div>
      <span role="status" className="ptr-sr">{refreshing ? 'Refreshing' : ''}</span>
      {children}
    </div>
  )
}
