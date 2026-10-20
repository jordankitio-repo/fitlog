// Every inline <script> in index.html must be listed in the CSP in
// vercel.json, by hash.
//
// This exists because of how the failure presents. Change one character of an
// inline script — a space, a comment, an extra preference — and its hash no
// longer matches the policy, so the deployed browser refuses to run it. It
// does not error in a way anyone sees: the dev server has no CSP, the build
// succeeds, the page loads. What breaks is only the work that script does
// before first paint, on production, for every visitor — the theme flashes
// wrong, the motion override never applies, and the reader who set a larger
// text size watches the whole page reflow after load.
//
// It was nearly introduced while adding the motion and text-size preferences
// to that script, which is to say this test is the thing that would have
// caught it, written immediately after it was caught by hand.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const html = readFileSync('index.html', 'utf8')
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))

const csp = vercel.headers
  ?.flatMap((h) => h.headers)
  ?.find((h) => h.key === 'Content-Security-Policy')?.value

// The hash covers the script's exact text content, byte for byte, with no
// trimming — which is why indentation changes alone are enough to break it.
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])

const sha256 = (s) => `sha256-${createHash('sha256').update(s).digest('base64')}`

describe('CSP script hashes', () => {
  it('has a policy to check against', () => {
    expect(csp, 'no Content-Security-Policy in vercel.json').toBeTruthy()
    expect(csp).toContain('script-src')
  })

  it('finds the inline scripts it is meant to be guarding', () => {
    // If this drops to zero the rest of the file passes vacuously, which is
    // the one way a test like this can rot into reassurance.
    expect(inlineScripts.length).toBeGreaterThan(0)
  })

  it.each(inlineScripts.map((s, i) => [i, s]))(
    'inline script %i is allowed by the policy',
    (_i, script) => {
      const hash = sha256(script)
      expect(
        csp.includes(hash),
        `index.html has an inline script the CSP does not allow.\n` +
        `Add this to script-src in vercel.json:\n  '${hash}'\n` +
        `Script starts: ${script.trim().slice(0, 70)}…`,
      ).toBe(true)
    },
  )

  // The other direction: a hash left behind after a script is deleted or
  // merged is a standing permission for a script nobody can read any more.
  it('lists no hash that no longer matches a script', () => {
    const listed = [...csp.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => m[1])
    const actual = inlineScripts.map(sha256)
    const orphans = listed.filter((h) => !actual.includes(h))
    expect(orphans, `stale hashes in vercel.json: ${orphans.join(', ')}`).toEqual([])
  })
})
