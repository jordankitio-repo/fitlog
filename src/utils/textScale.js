import { createPreference } from './preference'
import { isNativeApp } from './platform'

// Text size: 'default' | 'large' | 'largest'.
//
// This works at all because the type ramp in index.css is already in `rem`
// (--text-xs is 0.6875rem, not 11px), so every size in the app is a multiple
// of the root. One root font-size is therefore the whole control, and the
// alternative the design system warns about — a size override per component —
// never has to exist.
//
// It also means the app ALREADY respected a reader who had turned their
// browser's font size up, before this control existed. That is why the scale
// multiplies `100%` rather than setting a pixel size: `font-size: 20px` on the
// root would silently throw that setting away and make the app the only site
// that ignored it. Someone at 20px who picks Large gets 22.5px, not 18px.
const SCALES = { default: 1, large: 1.125, largest: 1.25 }

// `data-text-grown` on <html> whenever the two scales together enlarge text.
// A few layouts that hold at the designed size have to loosen only then --
// the stat strip's labels may wrap -- and doing it at every size would wrap
// them where they fit. Hoisted, so the preference's apply can call it.
function markGrown(doc) {
  const root = doc.documentElement
  const read = (name) => parseFloat(root.style.getPropertyValue(name)) || 1
  root.toggleAttribute('data-text-grown', read('--text-scale') * read('--system-text-scale') > 1.02)
}

const textScale = createPreference({
  key: 'gardnr-text-scale',
  values: Object.keys(SCALES),
  fallback: 'default',
  resolve: (pref) => SCALES[pref] ?? 1,
  apply: (scale) => {
    // Set on <html>, read by the `font-size: calc(100% * var(--text-scale))`
    // rule in index.css. Going through a variable rather than assigning
    // font-size directly keeps the formula in the stylesheet with the rest of
    // the type system, where someone changing the ramp will see it.
    document.documentElement.style.setProperty('--text-scale', String(scale))
    markGrown(document)
  },
})

export const getTextScalePref = textScale.read
export const setTextScalePref = textScale.set
export const useTextScalePref = textScale.usePreference
// No media query: the browser's own font-size setting is already folded in by
// the `100%` in the CSS, so there is no system event to follow.
export const initTextScale = () => textScale.init(null)
export { SCALES as TEXT_SCALES }

// THE IPHONE'S TEXT SIZE (Dynamic Type), in the native app.
//
// The `100%` above is the browser's font size, and in the app's web view that
// is fixed at 16px whatever the phone is set to. So a client who has turned
// their iPhone's text up -- the setting Apple expects every app to follow --
// got the same small text in Gardnr as everyone else. WebKit exposes that
// setting as the `-apple-system-body` font, so it is measured here and folded
// into the root size as --system-text-scale, under the in-app choice.
//
// 17px is the iOS body size at the default setting, so the default reads as 1
// and the design is unchanged for most readers. Clamped, because the largest
// accessibility sizes run past 3x and the layouts are not built for that; the
// in-app Large and Largest still go on top.
const IOS_BODY_PX = 17
const SYSTEM_SCALE_MIN = 0.85
const SYSTEM_SCALE_MAX = 1.35

export function systemScaleFromBodyPx(px) {
  if (!Number.isFinite(px) || px <= 0) return 1
  return Math.min(SYSTEM_SCALE_MAX, Math.max(SYSTEM_SCALE_MIN, px / IOS_BODY_PX))
}

function measureSystemTextScale(doc) {
  const probe = doc.createElement('span')
  probe.style.font = '-apple-system-body'
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.textContent = 'x'
  doc.body.appendChild(probe)
  const px = parseFloat(getComputedStyle(probe).fontSize)
  probe.remove()
  return systemScaleFromBodyPx(px)
}

// Native only: a browser has no -apple-system-body (outside Safari) and
// already folds its own font-size setting into the 100%. Re-measured when the
// app comes back, since that is when someone returns from changing it in
// Settings.
export function initSystemTextScale(doc = document) {
  if (!isNativeApp()) return
  const apply = () => {
    doc.documentElement.style.setProperty('--system-text-scale', String(measureSystemTextScale(doc)))
    markGrown(doc)
  }
  apply()
  doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') apply() })
}
