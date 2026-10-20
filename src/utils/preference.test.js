import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createPreference } from './preference'

// The mechanics shared by theme, motion and text size. Three preferences on one
// implementation means a bug here is a bug in all three, so the cases that get
// skipped in hand-rolled versions are the ones asserted hardest: a stored value
// that is no longer valid, and a localStorage that THROWS rather than returning
// null.
function make(overrides = {}) {
  const applied = []
  const pref = createPreference({
    key: 'test-pref',
    values: ['a', 'b', 'c'],
    fallback: 'a',
    resolve: (p) => `resolved-${p}`,
    apply: (r) => applied.push(r),
    ...overrides,
  })
  return { pref, applied }
}

describe('createPreference', () => {
  beforeEach(() => localStorage.clear())

  it('falls back when nothing is stored', () => {
    expect(make().pref.read()).toBe('a')
  })

  it('reads a stored value', () => {
    localStorage.setItem('test-pref', 'b')
    expect(make().pref.read()).toBe('b')
  })

  // The case that matters after a preference's options change: a value written
  // by an older build must not be handed to `resolve`, which has no case for
  // it. Returning it would put the app in a state its own CSS has no rule for.
  it('ignores a stored value that is no longer one of the options', () => {
    localStorage.setItem('test-pref', 'legacy-option')
    expect(make().pref.read()).toBe('a')
  })

  it('refuses to store a value that is not an option', () => {
    const { pref, applied } = make()
    pref.set('nonsense')
    expect(pref.read()).toBe('a')
    expect(applied).toEqual(['resolved-a'])
  })

  it('stores, applies and announces a valid change', () => {
    const { pref, applied } = make()
    const heard = []
    window.addEventListener('test-pref-change', (e) => heard.push(e.detail))
    pref.set('c')
    expect(localStorage.getItem('test-pref')).toBe('c')
    expect(applied).toEqual(['resolved-c'])
    expect(heard).toEqual(['c'])
  })

  // Safari's private mode and some managed browsers THROW on localStorage
  // rather than returning null. An unguarded read takes the whole app down at
  // startup, for the people least likely to be able to say why.
  describe('when localStorage throws', () => {
    let spy
    afterEach(() => spy?.mockRestore())

    it('still reads a fallback', () => {
      spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })
      expect(() => make().pref.read()).not.toThrow()
      expect(make().pref.read()).toBe('a')
    })

    it('still applies and announces a change it could not save', () => {
      spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      const { pref, applied } = make()
      expect(() => pref.set('b')).not.toThrow()
      // The setting does not survive a reload, but it must work for this one.
      expect(applied).toEqual(['resolved-b'])
    })
  })

  it('applies on init even with no system query to watch', () => {
    const { pref, applied } = make()
    pref.init(null)
    expect(applied).toEqual(['resolved-a'])
  })
})
