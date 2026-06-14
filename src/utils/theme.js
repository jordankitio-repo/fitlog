// Day/night theme. Preference is one of 'auto' | 'light' | 'dark' (default
// 'auto', which follows the OS). The resolved value is written to
// <html data-theme="..."> which flips the CSS-variable ramp in index.css.
// An inline script in index.html applies the same logic before first paint to
// avoid a flash; this module keeps it live afterwards.
import { useEffect, useState } from 'react'

const KEY = 'gardnr-theme'
const EVENT = 'gardnr-theme-change'

export function getThemePref() {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'auto') return v
  } catch { /* localStorage unavailable */ }
  return 'auto'
}

export function systemTheme() {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function resolveTheme(pref = getThemePref()) {
  return pref === 'auto' ? systemTheme() : pref
}

export function applyTheme(pref = getThemePref()) {
  document.documentElement.setAttribute('data-theme', resolveTheme(pref))
}

export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref) } catch { /* ignore */ }
  applyTheme(pref)
  window.dispatchEvent(new CustomEvent(EVENT, { detail: pref }))
}

// Call once at startup: keeps the app in sync with the OS while in 'auto'.
export function initThemeWatcher() {
  applyTheme()
  try {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener('change', () => {
      if (getThemePref() === 'auto') applyTheme('auto')
    })
  } catch { /* matchMedia unavailable */ }
}

// Hook for the profile toggle. Returns [pref, setPref] and stays in sync if the
// preference changes elsewhere.
export function useThemePref() {
  const [pref, setPref] = useState(getThemePref)
  useEffect(() => {
    const onChange = (e) => setPref(e.detail ?? getThemePref())
    window.addEventListener(EVENT, onChange)
    return () => window.removeEventListener(EVENT, onChange)
  }, [])
  return [pref, setThemePref]
}
