// iOS Safari auto-zooms the page when a form field is focused, and can leave it
// stuck zoomed after you navigate away (e.g. tapping "Sign in" from the password
// field). Our 16px inputs are meant to prevent this, but some iOS versions still
// zoom. Fix: lock the viewport scale ONLY while a field is focused, then release
// it — so the auto-zoom never fires, snaps back to 100% on blur, and pinch-zoom
// stays available everywhere else.
//
// WCAG 1.4.4 note: zoom is only momentarily constrained during active text entry
// and is fully reachable by blurring the field — the static viewport meta keeps
// no maximum-scale, so the page remains pinch-zoomable at rest.
export function initIosInputZoomGuard() {
  const meta = document.querySelector('meta[name="viewport"]')
  if (!meta) return

  const RELAXED = meta.getAttribute('content') || 'width=device-width, initial-scale=1.0'
  const LOCKED = `${RELAXED}, maximum-scale=1.0`
  const isField = (el) => !!el && typeof el.matches === 'function' && el.matches('input, select, textarea')

  document.addEventListener('focusin', (e) => {
    if (isField(e.target)) meta.setAttribute('content', LOCKED)
  })

  document.addEventListener('focusout', (e) => {
    if (!isField(e.target)) return
    // Keep it locked briefly so iOS snaps back to 100%, then relax to re-enable
    // pinch-zoom — but only if focus didn't move to another field.
    meta.setAttribute('content', LOCKED)
    setTimeout(() => {
      if (!isField(document.activeElement)) meta.setAttribute('content', RELAXED)
    }, 350)
  })
}
