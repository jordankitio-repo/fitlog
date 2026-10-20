import { createPreference } from './preference'

// Motion preference: 'system' | 'reduced' | 'full'.
//
// WHY AN OVERRIDE IS NOT THE WHOLE JOB. The app already had a
// `prefers-reduced-motion` rule, and it covered exactly one animation — the
// loading mark. Everything else kept its transitions: every control hover,
// every toggle knob, the splash fade, the toast. So "we honour reduced motion"
// was true of one element and false of the screen, and adding a switch on top
// of that would have been a switch that mostly did nothing.
//
// index.css now damps animation and transition globally, keyed off BOTH the
// media query and this attribute, so the OS setting still works with no
// JavaScript at all and the override only ever adds to it.
//
// 'full' exists for the person whose OS reduces motion system-wide but who
// wants this app to animate anyway. Without it the OS setting would be a
// ceiling rather than a default, which is the thing people dislike about
// system-wide switches.
const motion = createPreference({
  key: 'gardnr-motion',
  values: ['system', 'reduced', 'full'],
  fallback: 'system',
  // 'system' resolves to no attribute at all, leaving the media query in
  // charge. Resolving it to a concrete value here would mean a browser with
  // JavaScript disabled got whatever this module last guessed.
  resolve: (pref) => (pref === 'system' ? null : pref),
  apply: (resolved) => {
    const root = document.documentElement
    if (resolved) root.setAttribute('data-motion', resolved)
    else root.removeAttribute('data-motion')
  },
})

export const getMotionPref = motion.read
export const setMotionPref = motion.set
export const useMotionPref = motion.usePreference
export const initMotion = () => motion.init('(prefers-reduced-motion: reduce)')

// For JavaScript that animates on its own, where CSS cannot reach it.
//
// `scrollIntoView({ behavior: 'smooth' })` is the case that matters here: the
// behaviour is named in the call, so the CSS `scroll-behavior` property and
// every reduced-motion rule in the stylesheet are simply not consulted. A
// settings page that smooth-scrolls to a section is exactly the animation
// someone with vestibular sensitivity turned the setting on to avoid.
export function prefersReducedMotion() {
  const pref = motion.read()
  if (pref === 'reduced') return true
  if (pref === 'full') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

// The value to hand `scrollIntoView` / `scrollTo`, so call sites read as the
// intent ("scroll there") rather than as a branch.
export function scrollBehavior() {
  return prefersReducedMotion() ? 'auto' : 'smooth'
}
