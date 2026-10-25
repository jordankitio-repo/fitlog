import { describe, it, expect } from 'vitest'
import { quickActionRoute, takeLaunchQuickAction } from './quickActions'

describe('quickActionRoute', () => {
  it('routes each declared shortcut', () => {
    expect(quickActionRoute('fit.gardnr.app.log-food')).toBe('/log?action=add-food')
    expect(quickActionRoute('fit.gardnr.app.log-weight')).toBe('/log?action=log-weight')
    expect(quickActionRoute('fit.gardnr.app.scan-barcode')).toBe('/log?action=scan')
    expect(quickActionRoute('fit.gardnr.app.message-coach')).toBe('/coach?action=compose')
  })
  it('ignores an unknown or foreign type', () => {
    expect(quickActionRoute('fit.gardnr.app.something-old')).toBeNull()
    expect(quickActionRoute('com.other.app.log-food')).toBeNull()
    expect(quickActionRoute(undefined)).toBeNull()
  })
})

describe('takeLaunchQuickAction', () => {
  const memory = () => {
    const m = new Map()
    return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }
  }
  it('takes the injected shortcut once and clears it', () => {
    const win = { __gardnrQuickAction: { type: 'fit.gardnr.app.log-food', id: 'a' } }
    const store = memory()
    expect(takeLaunchQuickAction(win, store)).toBe('fit.gardnr.app.log-food')
    expect(win.__gardnrQuickAction).toBeNull()
    expect(takeLaunchQuickAction(win, store)).toBeNull()
  })
  it('does not act again when a reload re-injects the same launch', () => {
    const store = memory()
    takeLaunchQuickAction({ __gardnrQuickAction: { type: 'fit.gardnr.app.log-food', id: 'a' } }, store)
    expect(takeLaunchQuickAction({ __gardnrQuickAction: { type: 'fit.gardnr.app.log-food', id: 'a' } }, store)).toBeNull()
  })
  it('acts on a new launch', () => {
    const store = memory()
    takeLaunchQuickAction({ __gardnrQuickAction: { type: 'fit.gardnr.app.log-food', id: 'a' } }, store)
    expect(takeLaunchQuickAction({ __gardnrQuickAction: { type: 'fit.gardnr.app.message-coach', id: 'b' } }, store))
      .toBe('fit.gardnr.app.message-coach')
  })
  it('is null with nothing injected', () => {
    expect(takeLaunchQuickAction({}, memory())).toBeNull()
  })
})
