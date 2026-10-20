import { createPreference } from './preference'

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
  },
})

export const getTextScalePref = textScale.read
export const setTextScalePref = textScale.set
export const useTextScalePref = textScale.usePreference
// No media query: the browser's own font-size setting is already folded in by
// the `100%` in the CSS, so there is no system event to follow.
export const initTextScale = () => textScale.init(null)
export { SCALES as TEXT_SCALES }
