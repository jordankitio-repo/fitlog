// Shared helpers for the visual-QA shoot scripts.
//
// This exists because the same bug was sitting in twelve files at once. Every
// shoot script waits for page content with `waitForSelector`, which resolves
// the moment an element is attached and visible — UNDERNEATH the cold-start
// splash. index.html holds that splash for a MIN of 900ms and then fades it
// over 1600ms, so for ~2.5s after any authenticated load it covers the page
// completely. The screenshots came out as a black square with a logo on it.
//
// It is a silent failure, which is what made it survive: the files are written,
// they are plausibly sized, and nothing errors. A whole design-system
// programme was signed off against screenshots of a loading screen.
//
// Fixing it in one script and leaving eleven copies unfixed is how the original
// got here. One helper, imported.

// Wait until the splash is gone, transparent, or was never shown.
//
// `hidden` covers the logged-out case, where index.html removes the element
// outright; `opacity === '0'` covers the fade, which leaves it in the DOM for
// 1.6s after it stops being visible. Never throws: a shoot script that cannot
// see the splash should still take its picture, just loudly.
export async function settle(page, { timeout = 15000 } = {}) {
  await page
    .waitForFunction(
      () => {
        const s = document.getElementById('splash')
        return !s || s.hidden || getComputedStyle(s).opacity === '0'
      },
      null,
      { timeout },
    )
    .catch(() => console.log('  (splash never cleared — shot may be of the loading screen)'))
}

// A screenshot function bound to one page, with the wait already in it.
//
//   const shot = shooter(page, '/tmp/shots')
//   await shot('d-roster')
//
// Returned rather than exported as a bare `shot(page, name)` so a call site
// cannot take a screenshot without going through the wait.
export function shooter(page, outDir, { fullPage = false } = {}) {
  return async function shot(name, opts = {}) {
    await settle(page)
    await page.screenshot({ path: `${outDir}/${name}.png`, fullPage, ...opts })
    console.log('shot', name)
  }
}

// Refuse to run against anything that is not the local dev server.
//
// These scripts sign up real accounts and clean them up with the local stack's
// service-role key. Against a live project they have neither that key nor any
// way past delete-account's step-up check, so they leave orphaned users behind
// — which is exactly what happened the one time shoot.mjs was pointed at
// production. Nothing about `node scripts/shoot-x.mjs https://example.com`
// looks dangerous, so the guard has to be in the code rather than the README.
export function requireLocal(base) {
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(base)) return
  console.error(`Refusing to run against ${base}.

This harness is local-only: it creates accounts and relies on the local
Supabase stack to remove them again. To screenshot a deployed build, sign in
as a real account instead.`)
  process.exit(1)
}
