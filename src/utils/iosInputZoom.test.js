import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initIosInputZoomGuard } from './iosInputZoom'

// The guard locks the viewport (maximum-scale=1) while a text field is being
// used, because iOS Safari zooms the page on focus and can leave it stuck.
//
// Rewriting that meta tag makes the browser re-lay-out the viewport. These
// tests pin the two limits that matter, both of which were missing and both of
// which showed up as the same symptom: a native dropdown landing hundreds of
// pixels from the control that opened it, because the viewport moved
// underneath it mid-tap.
const RESTING = 'width=device-width, initial-scale=1.0'

function setUA(ua, touchPoints = 5) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touchPoints, configurable: true })
}

const viewport = () => document.querySelector('meta[name="viewport"]').getAttribute('content')

const tap = (el) => {
  document.body.appendChild(el)
  el.dispatchEvent(new Event('pointerdown', { bubbles: true }))
}

describe('iOS input zoom guard', () => {
  beforeEach(() => {
    document.head.innerHTML = `<meta name="viewport" content="${RESTING}">`
    document.body.innerHTML = ''
  })
  afterEach(() => vi.restoreAllMocks())

  it('locks the viewport when a text field is tapped on iOS', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    initIosInputZoomGuard()
    tap(document.createElement('input'))
    expect(viewport()).toContain('maximum-scale=1.0')
  })

  it('locks for a textarea too', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    initIosInputZoomGuard()
    tap(document.createElement('textarea'))
    expect(viewport()).toContain('maximum-scale=1.0')
  })

  // A <select> opens a native dropdown that the browser positions against the
  // control at the moment of the tap. This handler runs on pointerdown, BEFORE
  // that — so rewriting the viewport re-lays-out the page underneath a list
  // that has already been placed. And it was never needed: the zoom being
  // guarded against is iOS enlarging the page so a CARET stays legible, and a
  // select has no caret.
  it('leaves the viewport alone for a select, on iOS', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    initIosInputZoomGuard()
    tap(document.createElement('select'))
    expect(viewport()).toBe(RESTING)
  })

  // It is named for iOS and exists for an iOS Safari behaviour. Running
  // everywhere meant every other browser paid a viewport re-layout for a fix
  // it never needed.
  it('does nothing at all on a non-iOS browser', () => {
    setUA('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120')
    initIosInputZoomGuard()
    tap(document.createElement('input'))
    expect(viewport()).toBe(RESTING)
  })

  it('does nothing on a desktop Mac, which has no auto-zoom', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120', 0)
    initIosInputZoomGuard()
    tap(document.createElement('input'))
    expect(viewport()).toBe(RESTING)
  })

  // iPadOS reports a Mac UA; touch points are what give it away.
  it('still protects an iPad pretending to be a Mac', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5)
    initIosInputZoomGuard()
    tap(document.createElement('input'))
    expect(viewport()).toContain('maximum-scale=1.0')
  })
})
