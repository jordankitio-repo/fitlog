// Reusable billing / coach-signup QA harness — runs against the LOCAL stack.
//
// Prereqs (all part of the local billing test setup):
//   - supabase start           (local DB + auth + functions gateway)
//   - supabase functions serve --env-file supabase/functions/.env
//   - stripe listen --api-key <sk_test> --forward-to .../functions/v1/stripe-webhook
//   - npm run dev              (frontend at BASE, pointed at the local stack)
//   - BILLING_ENABLED = true   (temporarily, so the paywall renders)
//
// Run:
//   SERVICE_KEY=<local sb_secret from `supabase status`> node scripts/qa-billing.mjs
//
// Covers: each cadence completes with the right price / 14-day trial /
// billing_interval; a tampered cadence falls back to monthly (never a cheaper
// price); an already-subscribed coach cannot open a second checkout
// (double-charge guard); signup assigns the coach role even without the
// client-side profile write; coach deletion returns 200 and removes the account.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:5173'
const SUPA = process.env.SUPA || 'http://127.0.0.1:54321'
const SERVICE_KEY = process.env.SERVICE_KEY
if (!SERVICE_KEY) { console.error('Set SERVICE_KEY (local sb_secret_… from `supabase status`).'); process.exit(2) }

const envFile = (p) => Object.fromEntries(readFileSync(p, 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const fenv = envFile('supabase/functions/.env')
const STRIPE_KEY = fenv.STRIPE_SECRET_KEY
const PRICE = { monthly: fenv.STRIPE_COACH_PRICE_MONTHLY, '6mo': fenv.STRIPE_COACH_PRICE_6MO, annual: fenv.STRIPE_COACH_PRICE_ANNUAL }
const ANON_KEY = envFile('.env.local').VITE_SUPABASE_ANON_KEY

const results = []
const rec = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rnd = () => Math.random().toString(36).slice(2, 8)
const stripeGet = (path) => fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${STRIPE_KEY}` } }).then((r) => r.json())
const db = (path) => fetch(`${SUPA}/rest/v1/${path}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }).then((r) => r.json())
const callFn = (name, token, body) => fetch(`${SUPA}/functions/v1/${name}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })

const browser = await chromium.launch()

async function signupCoach() {
  const email = `qa-${rnd()}@example.com`, password = 'GardnrTest123!'
  const ctx = await browser.newContext(); const page = await ctx.newPage()
  await page.goto(`${BASE}/login?mode=signup&role=coach`, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('Full name').fill('QA Coach')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(password)
  await page.getByRole('checkbox').first().check().catch(() => {})
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForSelector('text=Start your free trial', { timeout: 25000 })
  const auth = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) { try { const s = JSON.parse(localStorage.getItem(k)); return { token: s.access_token, userId: s.user?.id } } catch {} } }
    return {}
  })
  return { email, password, ctx, page, token: auth.token, userId: auth.userId }
}

async function completeCheckout(page, cadence) {
  const label = { monthly: 'Monthly', '6mo': '6-month', annual: 'Annual' }[cadence]
  await page.getByText(label, { exact: true }).click()
  await page.getByRole('button', { name: /Start 14-day free trial/i }).click()
  await page.waitForURL('**checkout.stripe.com/**', { timeout: 30000 })
  await page.waitForTimeout(2500)
  const CARD_NUM = 'input[autocomplete="cc-number"], input[name="number"]'
  let cardFrame = null
  const strategies = [
    () => page.getByRole('radio', { name: /card/i }).check({ force: true, timeout: 3000 }),
    () => page.locator('#payment-method-accordion-item-title-card').check({ force: true, timeout: 3000 }),
    () => page.locator('[data-testid="card-accordion-item-button"]').click({ force: true, timeout: 3000 }),
  ]
  for (const s of strategies) { try { await s() } catch {} for (let i = 0; i < 8 && !cardFrame; i++) { for (const fr of page.frames()) { if (await fr.locator(CARD_NUM).count().catch(() => 0)) { cardFrame = fr; break } } if (!cardFrame) await page.waitForTimeout(500) } if (cardFrame) break }
  if (!cardFrame) throw new Error('card frame not found')
  try { const cb = page.locator('#enableStripePass'); if (await cb.count() && await cb.first().isChecked()) await cb.first().uncheck() } catch {}
  await cardFrame.locator(CARD_NUM).first().fill('4242424242424242')
  await cardFrame.locator('input[autocomplete="cc-exp"], input[name="expiry"]').first().fill('12 / 34')
  await cardFrame.locator('input[autocomplete="cc-csc"], input[name="cvc"]').first().fill('123')
  const fillAny = async (cands, val) => { for (const fr of page.frames()) for (const sel of cands) { const l = fr.locator(sel); if (await l.count().catch(() => 0)) { try { await l.first().fill(val, { timeout: 3000 }); return } catch {} } } }
  await fillAny(['input[autocomplete="cc-name"]', '#billingName'], 'QA Coach')
  await fillAny(['input[autocomplete="postal-code"]', '#billingPostalCode'], '12345')
  await page.getByRole('button', { name: /Start trial|Subscribe|Pay\b/i }).first().click().catch(async () => { await page.locator('[data-testid="hosted-payment-submit-button"]').first().click() })
  await page.waitForURL((u) => !String(u).includes('checkout.stripe.com'), { timeout: 40000 }).catch(() => {})
}

async function waitForSubRow(userId) {
  for (let i = 0; i < 24; i++) {
    const rows = await db(`subscriptions?coach_id=eq.${userId}&select=status,stripe_price_id,billing_interval,trial_end,stripe_subscription_id`)
    const row = Array.isArray(rows) ? rows[0] : null
    if (row && row.status && row.status !== 'incomplete') return row
    await sleep(1500)
  }
  return null
}

// ── Cases 1-3: each cadence completes end-to-end ────────────────────────────
console.log('\n▶ Cadence completion (price · 14-day trial · billing_interval)')
for (const cadence of ['monthly', '6mo', 'annual']) {
  const c = await signupCoach()
  try {
    await completeCheckout(c.page, cadence)
    const row = await waitForSubRow(c.userId)
    const sub = row?.stripe_subscription_id ? await stripeGet(`subscriptions/${row.stripe_subscription_id}`) : null
    const trialDays = sub?.trial_end && sub?.trial_start ? Math.round((sub.trial_end - sub.trial_start) / 86400) : null
    const ok = row?.stripe_price_id === PRICE[cadence] && row?.billing_interval === cadence && ['trialing', 'active'].includes(row?.status) && trialDays === 14
    rec(`${cadence}`, ok, `price ${row?.stripe_price_id === PRICE[cadence] ? '✓' : '✗'} · billing_interval=${row?.billing_interval} · status=${row?.status} · trial=${trialDays}d`)
  } catch (e) { rec(`${cadence}`, false, e.message.slice(0, 80)) }

  // ── Case 4: double-charge guard (reuse the monthly coach, now trialing) ──
  if (cadence === 'monthly') {
    const res = await callFn('create-checkout-session', c.token, { cadence: 'monthly' })
    rec('double-charge guard (2nd checkout while trialing → rejected)', res.status === 400, `HTTP ${res.status}`)
  }
  await c.ctx.close()
}

// ── Case 5: tampered cadence → monthly fallback (no cheaper-price exploit) ───
console.log('\n▶ Security: tampered cadence')
{
  const c = await signupCoach()
  try {
    const res = await callFn('create-checkout-session', c.token, { cadence: 'free_hack_9000' })
    const { url } = await res.json()
    const csId = (url || '').match(/cs_test_[A-Za-z0-9]+/)?.[0]
    const session = csId ? await stripeGet(`checkout/sessions/${csId}?expand[]=line_items`) : null
    const priceId = session?.line_items?.data?.[0]?.price?.id
    rec('tampered cadence resolves to MONTHLY (never cheaper)', priceId === PRICE.monthly, `resolved price ${priceId === PRICE.monthly ? '= monthly ✓' : '= ' + priceId}`)
  } catch (e) { rec('tampered cadence', false, e.message.slice(0, 80)) }
  await c.ctx.close()
}

// ── Case 6: signup assigns coach role WITHOUT the client-side profile write ──
console.log('\n▶ Signup hardening: role assigned by the trigger from metadata')
{
  const email = `qa-trig-${rnd()}@example.com`
  const r = await fetch(`${SUPA}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'GardnrTest123!', data: { role: 'coach', full_name: 'Trigger Coach' } }) })
  const j = await r.json()
  const uid = j.user?.id || j.id
  await sleep(800)
  const rows = uid ? await db(`profiles?id=eq.${uid}&select=role,full_name`) : []
  const role = Array.isArray(rows) ? rows[0]?.role : null
  rec('role=coach set by trigger (no client upsert)', role === 'coach', `profile role=${role ?? 'null'}`)
}

// ── Case 7: coach deletion returns 200 and removes the account ───────────────
console.log('\n▶ Lifecycle: coach account deletion')
{
  const c = await signupCoach()
  const res = await callFn('delete-account', c.token)
  const body = await res.json().catch(() => ({}))
  await sleep(800)
  const rows = await db(`profiles?id=eq.${c.userId}&select=id`)
  const gone = Array.isArray(rows) && rows.length === 0
  rec('coach delete → 200 + account removed', res.status === 200 && body.success === true && gone, `HTTP ${res.status} · profile ${gone ? 'gone ✓' : 'still present ✗'}`)
  await c.ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(`\n${'─'.repeat(50)}\n${results.length - failed.length}/${results.length} passed` + (failed.length ? `\nFAILED: ${failed.map((f) => f.name).join('; ')}` : ' 🎉'))
process.exit(failed.length ? 1 : 0)
