import { useRef, useCallback } from 'react'

// Press-and-hold, for opening a row's actions without a row full of icons.
//
// DELIBERATELY AN ACCELERATOR, NEVER THE ONLY ROUTE. A long press cannot be
// performed with a keyboard or a screen reader, so every action reachable this
// way must also have a visible control. Treat a row whose only path to Delete
// is a hold as a bug, not a clean design.
//
// Three things make this survivable on a phone, and all three were bugs the
// first time this pattern gets written:
//
//  1. MOVEMENT CANCELS. A list row is inside a scroller, and a flick starts
//     with a finger resting on a row. Without a tolerance every scroll that
//     began slowly would open a menu. 10px is roughly the slop iOS itself
//     allows before it calls a touch a drag.
//
//  2. THE CLICK AFTER IS SWALLOWED. A long press ends with a pointerup, which
//     the browser then turns into a click -- so the row's own tap action would
//     fire the instant the menu opened, behind it. `fired` is checked by the
//     returned onClick and resets on the next press.
//
//  3. THE NATIVE CALLOUT IS REFUSED. In a WKWebView a hold raises the system
//     text-selection/share bubble, which lands on top of anything we show.
//     That is CSS, not JS: callers must carry `className="long-pressable"`
//     (index.css), which switches it off for coarse pointers only -- a desktop
//     keeps text selectable.
//
// THE HOLD IS VISIBLE. Without feedback a hold reads as "nothing happened"
// until the sheet appears, so a finger lets go at 400ms and tries again. The
// row takes `data-pressing` and index.css eases it into a tint and a slight
// shrink that lands exactly when the menu opens -- the row is the progress
// bar. It waits out a short grace first, so a tap or the start of a scroll
// never flashes. Touch and pen only: a mouse has right-click, and a tint on
// every desktop mousedown would be noise.
//
// contextmenu is wired to the same handler so a right-click on a desktop opens
// the same menu. That is the one place a long press has a true mouse analogue.
// Called ONCE per component, returns a `bind(onLongPress)` you call per row.
//
// A list row is rendered by a plain function, not a component, so a hook
// cannot be called inside the loop. The refs are shared across every row,
// which is correct rather than a compromise: only one finger is down at a
// time, so only one press can ever be in flight.
const PRESS_GRACE = 120 // ms before a touch starts to look like a hold

export function useLongPress({ delay = 500, moveTolerance = 10 } = {}) {
  const timer = useRef(null)
  const graceTimer = useRef(null)
  const pressed = useRef(null)
  const origin = useRef(null)
  const fired = useRef(false)

  const release = useCallback(() => {
    if (graceTimer.current) { clearTimeout(graceTimer.current); graceTimer.current = null }
    if (pressed.current) { delete pressed.current.dataset.pressing; pressed.current = null }
  }, [])

  const clear = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    origin.current = null
    release()
  }, [release])

  const start = useCallback((e, onLongPress) => {
    if (!onLongPress) return
    // Anything inside [data-no-longpress] is out. Two reasons, and the first
    // is a real collision: dnd-kit's TouchSensor starts a drag after 120ms, so
    // a finger resting on the grip while deciding where to drop would ALSO
    // trip this at 500ms and throw a sheet over a drag in progress. The second
    // is plainer -- holding the Delete icon should not open a menu offering
    // Delete. Marking the controls rather than excluding `button` wholesale,
    // because a row's whole body can itself be a button (the meal group's
    // expand toggle) and that row must stay pressable.
    if (e.target?.closest?.('[data-no-longpress]')) return
    // Secondary buttons already have contextmenu; a middle-click hold is not a
    // gesture anyone means.
    if (e.pointerType === 'mouse' && e.button !== 0) return
    fired.current = false
    origin.current = { x: e.clientX, y: e.clientY }
    if (e.pointerType !== 'mouse') {
      const el = e.currentTarget
      graceTimer.current = setTimeout(() => {
        graceTimer.current = null
        // The ease runs over what is left of the hold, so it finishes as the
        // menu opens however `delay` is tuned.
        el.style.setProperty('--press-ms', `${delay - PRESS_GRACE}ms`)
        el.dataset.pressing = ''
        pressed.current = el
      }, PRESS_GRACE)
    }
    timer.current = setTimeout(() => {
      fired.current = true
      timer.current = null
      release()
      onLongPress(e)
    }, delay)
  }, [delay, release])

  const move = useCallback((e) => {
    if (!timer.current || !origin.current) return
    const dx = Math.abs(e.clientX - origin.current.x)
    const dy = Math.abs(e.clientY - origin.current.y)
    if (dx > moveTolerance || dy > moveTolerance) clear()
  }, [clear, moveTolerance])

  const onClick = useCallback((e) => {
    if (!fired.current) return
    // The press already opened the menu. Stop the synthetic click behind it.
    e.preventDefault()
    e.stopPropagation()
    fired.current = false
  }, [])

  return useCallback((onLongPress) => ({
    onPointerDown: (e) => start(e, onLongPress),
    onPointerMove: move,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClick,
    onContextMenu: (e) => {
      if (!onLongPress) return
      e.preventDefault()
      onLongPress(e)
    },
  }), [start, move, clear, onClick])
}
