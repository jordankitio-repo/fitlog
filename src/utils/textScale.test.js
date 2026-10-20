import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { setTextScalePref, getTextScalePref, TEXT_SCALES } from './textScale'

const read = () => document.documentElement.style.getPropertyValue('--text-scale')

describe('text size preference', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.style.removeProperty('--text-scale')
  })

  it('defaults to the unscaled ramp', () => {
    expect(getTextScalePref()).toBe('default')
    expect(TEXT_SCALES.default).toBe(1)
  })

  it('writes the multiplier the stylesheet reads', () => {
    setTextScalePref('large')
    expect(read()).toBe('1.125')
    setTextScalePref('largest')
    expect(read()).toBe('1.25')
    setTextScalePref('default')
    expect(read()).toBe('1')
  })

  it('only ever grows the type', () => {
    // A "small" option would push --text-xs below 11px, which the ramp calls
    // its floor and Apple's HIG calls the minimum legible size.
    for (const scale of Object.values(TEXT_SCALES)) expect(scale).toBeGreaterThanOrEqual(1)
  })

  it('ignores a value it does not know', () => {
    setTextScalePref('enormous')
    expect(getTextScalePref()).toBe('default')
    expect(read()).toBe('1')
  })

  // Three places have to agree or the control silently does nothing: this
  // module writes --text-scale, index.css has to consume it on the root, and
  // the pre-paint script in index.html has to apply the same numbers before
  // the page renders. Each is invisible on its own.
  it('is actually consumed by the stylesheet', () => {
    const css = readFileSync('src/index.css', 'utf8')
    expect(css, '--text-scale is never declared').toContain('--text-scale: 1')
    expect(css.replace(/\s+/g, ' '), 'the root never multiplies by it')
      .toContain('font-size: calc(100% * var(--text-scale))')
  })

  it('is applied before first paint with the same numbers', () => {
    const html = readFileSync('index.html', 'utf8')
    expect(html).toContain('gardnr-text-scale')
    for (const [name, value] of Object.entries(TEXT_SCALES)) {
      expect(html, `index.html is missing the ${name} scale`).toContain(`${name}: ${value}`)
    }
  })
})
