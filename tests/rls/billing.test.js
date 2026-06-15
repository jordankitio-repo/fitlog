// Billing invariants that protect money + entitlements. These exercise the
// DB-level contracts the Stripe edge functions rely on (full signed-webhook
// flow needs Stripe test creds + `supabase functions serve` and is a separate
// layer). Focus here: free-trial abuse prevention and subscription idempotency.
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { admin, makeUser, cleanupUsers } from './helpers.js'

describe('trial_ledger (free-trial abuse prevention)', () => {
  const hash = `hash-${Date.now()}-${Math.random().toString(36).slice(2)}`

  afterAll(async () => { await admin.from('trial_ledger').delete().eq('email_hash', hash) })

  it('enforces one ledger row per email_hash (cannot mint a second trial row)', async () => {
    const a = await admin.from('trial_ledger').insert({ email_hash: hash, coach_trial_used: true })
    expect(a.error).toBeNull()
    const b = await admin.from('trial_ledger').insert({ email_hash: hash, coach_trial_used: true })
    expect(b.error).not.toBeNull()
    expect(b.error.code).toBe('23505') // unique_violation
  })

  it('merge-upsert preserves a prior used flag (survives account deletion / re-signup)', async () => {
    // Mirrors stripe-webhook markTrialUsed: POST on_conflict=email_hash with
    // Prefer: resolution=merge-duplicates, writing only the one flag + updated_at.
    await admin.from('trial_ledger')
      .upsert({ email_hash: hash, solo_trial_used: true }, { onConflict: 'email_hash' })
    const { data } = await admin.from('trial_ledger')
      .select('coach_trial_used, solo_trial_used').eq('email_hash', hash).single()
    expect(data.coach_trial_used).toBe(true) // earlier flag NOT clobbered
    expect(data.solo_trial_used).toBe(true)  // new flag merged in
  })

  it('eligibility read reflects the recorded flag (second free trial blocked)', async () => {
    // create-checkout-session computes: coachTrialEligible = !ledger?.coach_trial_used
    const { data } = await admin.from('trial_ledger')
      .select('coach_trial_used').eq('email_hash', hash).maybeSingle()
    const coachTrialEligible = !data?.coach_trial_used
    expect(coachTrialEligible).toBe(false)
  })
})

describe('subscriptions (idempotency / replay safety)', () => {
  let coach, solo, all
  beforeAll(async () => {
    coach = await makeUser('coach', 'billCoach')
    solo = await makeUser('solo', 'billSolo')
    all = [coach, solo]
  })
  afterAll(async () => { await cleanupUsers(all) })

  it('UNIQUE(coach_id) blocks a duplicate coach subscription', async () => {
    const a = await admin.from('subscriptions')
      .insert({ coach_id: coach.id, status: 'trialing', stripe_subscription_id: 'sub_test_coach_1' })
    expect(a.error).toBeNull()
    const b = await admin.from('subscriptions')
      .insert({ coach_id: coach.id, status: 'trialing', stripe_subscription_id: 'sub_test_coach_2' })
    expect(b.error).not.toBeNull()
    expect(b.error.code).toBe('23505')
  })

  // Was a gap (UNIQUE(coach_id) existed but solo_id was unprotected); now closed
  // by the partial unique index in 20260615000200_subscriptions_solo_unique.
  it('partial UNIQUE(solo_id) blocks a duplicate solo subscription', async () => {
    const a = await admin.from('subscriptions')
      .insert({ solo_id: solo.id, status: 'trialing', stripe_subscription_id: 'sub_test_solo_1' })
    expect(a.error).toBeNull()
    const b = await admin.from('subscriptions')
      .insert({ solo_id: solo.id, status: 'trialing', stripe_subscription_id: 'sub_test_solo_2' })
    expect(b.error).not.toBeNull()
    expect(b.error.code).toBe('23505')
  })
})
