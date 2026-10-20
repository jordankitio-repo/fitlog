import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prefersReducedMotion, scrollBehavior, setMotionPref, getMotionPref } from './motion'

// `scrollIntoView({ behavior: 'smooth' })` names its behaviour in the call, so
// the CSS reduced-motion rules never see it. A settings page that smooth-scrolls
// to a section is precisely the animation someone with vestibular sensitivity
// turned the preference on to stop, and it would have kept doing it.
//
// jsdom has no matchMedia, which is also what a very old browser looks like:
// the `try` in prefersReducedMotion has to survive it rather than throw on the
// first scroll.
function mockSystemReduce(matches) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
}

describe('motion preference', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => { delete window.matchMedia })

  it('defaults to following the system', () => {
    expect(getMotionPref()).toBe('system')
  })

  it('follows the system when set to system', () => {
    mockSystemReduce(true)
    expect(prefersReducedMotion()).toBe(true)
    mockSystemReduce(false)
    expect(prefersReducedMotion()).toBe(false)
  })

  // Both overrides have to beat the OS, in BOTH directions. "Reduced" on a
  // machine that allows motion is the common case; "Full" on a machine that
  // reduces it is the one that stops the OS setting being a ceiling rather
  // than a default.
  it('lets Reduced override a system that allows motion', () => {
    mockSystemReduce(false)
    setMotionPref('reduced')
    expect(prefersReducedMotion()).toBe(true)
  })

  it('lets Full override a system that reduces motion', () => {
    mockSystemReduce(true)
    setMotionPref('full')
    expect(prefersReducedMotion()).toBe(false)
  })

  it('writes the override to the document, and clears it for system', () => {
    setMotionPref('reduced')
    expect(document.documentElement.getAttribute('data-motion')).toBe('reduced')
    setMotionPref('system')
    // Removed, not set to "system": the CSS media query has to be left in
    // charge, so a browser with no JavaScript still honours the OS setting.
    expect(document.documentElement.getAttribute('data-motion')).toBeNull()
  })

  it('assumes motion is fine when the browser cannot be asked', () => {
    // No matchMedia at all. Guessing "reduced" here would silently strip
    // animation from every old browser; guessing "allowed" matches what the
    // app did before any of this existed.
    expect(prefersReducedMotion()).toBe(false)
  })

  it('hands scroll callers the behaviour they should use', () => {
    mockSystemReduce(false)
    expect(scrollBehavior()).toBe('smooth')
    setMotionPref('reduced')
    expect(scrollBehavior()).toBe('auto')
  })
})
