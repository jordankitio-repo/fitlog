// iOS Safari auto-zooms the page when a form field is focused, and can leave it
// stuck zoomed after you navigate away (e.g. tapping "Sign in" from the password
// field). 16px inputs are meant to prevent this, but some iOS versions zoom
// anyway. Fix: lock the viewport scale (maximum-scale=1) while a field is being
// interacted with, then release it — so the auto-zoom never fires, it snaps back
// to 100% on blur, and pinch-zoom stays available everywhere else.
//
// Timing is the whole game: iOS decides whether to zoom AT THE MOMENT focus
// lands, so locking on `focusin` is too late — Safari has already zoomed. We lock
// on the pointer/touch DOWN instead (which precedes focus), so maximum-scale=1 is
// in place before iOS makes its decision. `focusin` remains as a fallback for
// keyboard / programmatic focus (which don't trigger the auto-zoom anyway).
//
// WCAG 1.4.4 note: zoom is only momentarily constrained during active text entry
// and is fully reachable by blurring the field — the static viewport meta keeps
// no maximum-scale, so the page remains pinch-zoomable at rest (and axe stays
// clean, since it scans the resting meta).
export function initIosInputZoomGuard() {
  const meta = document.querySelector('meta[name="viewport"]')
  if (!meta) return

  const RELAXED = meta.getAttribute('content') || 'width=device-width, initial-scale=1.0'
  const LOCKED = `${RELAXED}, maximum-scale=1.0`
  const isField = (el) => !!el && typeof el.matches === 'function' && el.matches('input, select, textarea')

  const lock = () => {
    if (meta.getAttribute('content') !== LOCKED) meta.setAttribute('content', LOCKED)
  }
  const relax = () => {
    if (meta.getAttribute('content') !== RELAXED) meta.setAttribute('content', RELAXED)
  }

  // Lock BEFORE focus. touchstart/pointerdown fire on tap-down, ahead of the
  // focus that triggers the auto-zoom. Capture phase + the target being (or
  // sitting inside) a field — e.target is the tapped node, which for an input tap
  // is the input itself. Use closest() too so a tap on padding still counts.
  const onDown = (e) => {
    const t = e.target
    if (isField(t) || (t && typeof t.closest === 'function' && t.closest('input, select, textarea'))) {
      lock()
    }
  }
  document.addEventListener('touchstart', onDown, { passive: true, capture: true })
  document.addEventListener('pointerdown', onDown, { capture: true })
  document.addEventListener('focusin', (e) => {
    if (isField(e.target)) lock()
  })

  document.addEventListener('focusout', (e) => {
    if (!isField(e.target)) return
    // Hold the lock briefly so iOS snaps back to 100%, then relax to re-enable
    // pinch-zoom — but only if focus didn't move straight to another field.
    lock()
    setTimeout(() => {
      if (!isField(document.activeElement)) relax()
    }, 350)
  })
}
