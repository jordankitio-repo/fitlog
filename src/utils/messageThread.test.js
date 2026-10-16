import { describe, it, expect } from 'vitest'
import { refreshSize, growSize, toOldestFirst, hasOlderMessages, MESSAGE_PAGE } from './messageThread'

describe('window sizing', () => {
  it('opens on one page', () => {
    expect(refreshSize(0)).toBe(MESSAGE_PAGE)
  })

  // The distinction that matters: a refresh after sending must NOT quietly
  // enlarge the window, or every send pages in more history.
  it('refresh keeps the window it already had', () => {
    expect(refreshSize(MESSAGE_PAGE)).toBe(MESSAGE_PAGE)
    expect(refreshSize(MESSAGE_PAGE * 2)).toBe(MESSAGE_PAGE * 2)
  })

  it('grow adds exactly one page', () => {
    expect(growSize(0)).toBe(MESSAGE_PAGE * 2)
    expect(growSize(MESSAGE_PAGE)).toBe(MESSAGE_PAGE * 2)
    expect(growSize(MESSAGE_PAGE * 2)).toBe(MESSAGE_PAGE * 3)
  })

  // A thread shorter than a page must not shrink the window below one page, or
  // a refresh would start truncating a conversation that fits comfortably.
  it('never shrinks below one page on a short thread', () => {
    expect(refreshSize(3)).toBe(MESSAGE_PAGE)
    expect(growSize(3)).toBe(MESSAGE_PAGE * 2)
  })
})

describe('toOldestFirst', () => {
  // Rows arrive newest-first because that is the only way to anchor the window
  // at the END of a thread; render order is the opposite.
  it('flips a newest-first page into render order', () => {
    const rows = [{ id: 3 }, { id: 2 }, { id: 1 }]
    expect(toOldestFirst(rows).map(r => r.id)).toEqual([1, 2, 3])
  })

  it('does not mutate the input', () => {
    const rows = [{ id: 2 }, { id: 1 }]
    toOldestFirst(rows)
    expect(rows.map(r => r.id)).toEqual([2, 1])
  })

  it('survives a null page', () => {
    expect(toOldestFirst(null)).toEqual([])
    expect(toOldestFirst(undefined)).toEqual([])
  })
})

describe('hasOlderMessages', () => {
  it('is true only while the thread outruns the window', () => {
    expect(hasOlderMessages(120, 50)).toBe(true)
    expect(hasOlderMessages(50, 50)).toBe(false)
    expect(hasOlderMessages(12, 12)).toBe(false)
  })

  it('treats a missing count as nothing older, not as more', () => {
    expect(hasOlderMessages(null, 0)).toBe(false)
    expect(hasOlderMessages(undefined, 10)).toBe(false)
  })
})
