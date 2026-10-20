import { useEffect, useState } from 'react'

// The mechanics every appearance preference needs: read a stored choice,
// validate it, resolve it to something the DOM understands, write that to
// <html>, tell the rest of the app, and keep a React hook in sync.
//
// It was extracted when motion and text size arrived. `theme.js` had carried
// all of it for one preference, and the choice was between three copies of
// localStorage-plus-CustomEvent-plus-useEffect or one implementation. Three
// copies of a mechanism is three places to fix a bug in, and nothing makes
// them drift faster than being nearly identical — the second copy gets the
// try/catch and the third doesn't.
//
// Every read is wrapped: `localStorage` THROWS rather than returning null in a
// Safari private window and under some corporate policies, so an unguarded
// read takes the whole app down at startup for the people least able to report
// why.
export function createPreference({ key, values, fallback, resolve, apply }) {
  const EVENT = `${key}-change`

  function read() {
    try {
      const v = localStorage.getItem(key)
      if (values.includes(v)) return v
    } catch { /* localStorage unavailable */ }
    return fallback
  }

  function applyPref(pref = read()) {
    apply(resolve(pref))
  }

  function set(pref) {
    const next = values.includes(pref) ? pref : fallback
    try { localStorage.setItem(key, next) } catch { /* ignore */ }
    applyPref(next)
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }))
  }

  // Keeps the app following the OS while the preference is on its system
  // setting. `query` is a media query string, or null for a preference with no
  // system equivalent.
  function init(query) {
    applyPref()
    if (!query) return
    try {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', () => {
        if (read() === fallback) applyPref(fallback)
      })
    } catch { /* matchMedia unavailable */ }
  }

  function usePreference() {
    const [pref, setPref] = useState(read)
    useEffect(() => {
      const onChange = (e) => setPref(e.detail ?? read())
      window.addEventListener(EVENT, onChange)
      return () => window.removeEventListener(EVENT, onChange)
    }, [])
    return [pref, set]
  }

  return { read, set, apply: applyPref, init, usePreference }
}
