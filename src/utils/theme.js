// Day/night theme. Preference is one of 'auto' | 'light' | 'dark' (default
// 'auto', which follows the OS). The resolved value is written to
// <html data-theme="..."> which flips the CSS-variable ramp in index.css.
// An inline script in index.html applies the same logic before first paint to
// avoid a flash; this module keeps it live afterwards.
//
// The storage/event/hook mechanics moved to preference.js when motion and text
// size needed the same ones. This file kept its name and its exports, because
// both are referenced by the design system doc and by every call site; what it
// no longer keeps is its own copy of the machinery.
import { registerPlugin } from '@capacitor/core'
import { createPreference } from './preference'
import { isNativeApp } from './platform'

export function systemTheme() {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function resolveTheme(pref) {
  return pref === 'auto' || !pref ? systemTheme() : pref
}

const Appearance = registerPlugin('Appearance')

const theme = createPreference({
  key: 'gardnr-theme',
  values: ['auto', 'light', 'dark'],
  fallback: 'auto',
  resolve: resolveTheme,
  apply: (resolved) => {
    document.documentElement.setAttribute('data-theme', resolved)
    // In the iPhone app, the status bar and system sheets follow it too
    // (AppearancePlugin, SceneDelegate.swift) rather than the phone's setting.
    // Automatic hands the window back to the phone ('auto'), never the
    // resolved value: a window forced dark makes the web view report dark as
    // the phone's appearance, and Automatic would then never come back.
    if (isNativeApp()) Appearance.setStyle({ theme: theme.read() === 'auto' ? 'auto' : resolved }).catch(() => {})
  },
})

export const getThemePref = theme.read
export const setThemePref = theme.set
export const applyTheme = theme.apply
export const useThemePref = theme.usePreference

// Call once at startup: keeps the app in sync with the OS while in 'auto'.
export const initThemeWatcher = () => theme.init('(prefers-color-scheme: light)')
