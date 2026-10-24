// The native-build guards. Small surface, but the cost of each one being wrong
// is specific and large, so each is pinned:
//
//   isCoachOnNative   wrong-true  -> a coach is locked out of their own app
//                     wrong-false -> the Stripe paywall renders inside the
//                                    App Store build, which is the 15-30% cut
//   hidesPaymentUI    wrong-false -> same cut, by the Solo route
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const isNativePlatform = vi.fn()
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => isNativePlatform() } }))

const { isNativeApp, isCoachOnNative, hidesPaymentUI } = await import('./platform.js')

describe('platform guards', () => {
  beforeEach(() => { isNativePlatform.mockReset() })
  afterEach(() => { vi.clearAllMocks() })

  describe('in a browser (including an installed PWA)', () => {
    beforeEach(() => { isNativePlatform.mockReturnValue(false) })

    it('is not the native app', () => {
      expect(isNativeApp()).toBe(false)
    })

    // The whole point: the web app keeps working exactly as it did. A coach on
    // the web is a coach, and the billing screens are theirs to use.
    it('leaves the coach alone', () => {
      expect(isCoachOnNative('coach')).toBe(false)
    })

    it('leaves payment UI alone', () => {
      expect(hidesPaymentUI()).toBe(false)
    })
  })

  describe('inside the App Store build', () => {
    beforeEach(() => { isNativePlatform.mockReturnValue(true) })

    it('is the native app', () => {
      expect(isNativeApp()).toBe(true)
    })

    it('refuses a coach', () => {
      expect(isCoachOnNative('coach')).toBe(true)
    })

    // The gate is the ROLE, not the route. Everyone else is a client of some
    // kind and the app is theirs.
    it('admits every non-coach role', () => {
      for (const role of ['client', 'solo', null, undefined, '']) {
        expect(isCoachOnNative(role), `role ${String(role)} was refused`).toBe(false)
      }
    })

    it('hides payment UI', () => {
      expect(hidesPaymentUI()).toBe(true)
    })
  })
})
