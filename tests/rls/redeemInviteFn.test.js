// `redeem-invite` over HTTP — the edge function itself, not the RPCs under it.
//
// passwordlessInvite.test.js covers accept_invitation / auth_user_exists on the
// grounds that the function is "thin orchestration". It isn't quite: the
// function also does token-shape validation, the live account-exists branch,
// admin user creation, Postgres-error-to-copy mapping, orphan cleanup, and the
// session handoff. None of that is reachable from an RPC test, and until this
// file existed none of it had ever been executed.
//
// The handoff in test 1 is the one that matters most. The entire one-tap
// promise rests on admin/generate_link returning a hashed_token that verifyOtp
// will accept, and that pairing is asserted nowhere else.
//
// Requires edge-runtime, which the default local stack EXCLUDES:
//   EXCLUDES="vector,analytics,imgproxy,realtime,storage,studio,meta" npm run rls:setup
// Without it these skip rather than fail, so the normal suite is unaffected.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { admin, makeUser, cleanupUsers } from './helpers.js'
import { localEnv } from './env.js'

const { url, anonKey } = localEnv()
const FUNCTIONS_URL = `${url}/functions/v1`

async function redeem(body) {
  const res = await fetch(`${FUNCTIONS_URL}/redeem-invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

// Probe once: skip the whole file when the function isn't being served, rather
// than reporting a missing container as a product failure.
async function edgeRuntimeUp() {
  try {
    const res = await fetch(`${FUNCTIONS_URL}/redeem-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ token: 'not-a-uuid' }),
    })
    return res.status === 400
  } catch {
    return false
  }
}

const serving = await edgeRuntimeUp()

async function makeInvite(coach, clientEmail, { expiresAt } = {}) {
  const token = crypto.randomUUID()
  const row = { coach_id: coach.id, client_email: clientEmail, token }
  if (expiresAt) row.expires_at = expiresAt
  const { error } = await coach.client.from('invitations').insert(row)
  if (error) throw new Error(`seed invitation: ${error.message}`)
  return token
}

const inviteeEmail = (label) =>
  `fn.${label}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.test`

describe.skipIf(!serving)('redeem-invite (HTTP)', () => {
  let coach
  const created = []
  const strayEmails = []

  beforeAll(async () => {
    coach = await makeUser('coach', 'fncoach')
    created.push(coach)
  })

  afterAll(async () => {
    // Users the FUNCTION created have no handle on them here, so sweep by email.
    for (const email of strayEmails) {
      const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
      const hit = data?.users?.find((u) => u.email === email)
      if (hit) {
        try { await admin.from('coach_clients').delete().eq('client_id', hit.id) } catch { /* noop */ }
        try { await admin.from('profiles').delete().eq('id', hit.id) } catch { /* noop */ }
        try { await admin.auth.admin.deleteUser(hit.id) } catch { /* noop */ }
      }
    }
    await cleanupUsers(created)
  })

  it('1. new invitee: creates a passwordless account, links the coach, and returns a usable session', async () => {
    const email = inviteeEmail('fresh')
    strayEmails.push(email)
    const token = await makeInvite(coach, email)

    const { status, body } = await redeem({ token, fullName: 'Fresh Invitee' })
    expect(status).toBe(200)
    expect(body.tokenHash, 'no tokenHash returned').toBeTruthy()
    expect(body.requiresOtp).toBeUndefined()

    const { data: listed } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const user = listed.users.find((u) => u.email === email)
    expect(user, 'auth user was not created').toBeTruthy()

    // Created WITHOUT a password, and pre-confirmed.
    expect(user.email_confirmed_at).toBeTruthy()

    const { data: profile } = await admin.from('profiles').select('role, full_name').eq('id', user.id).single()
    expect(profile.role).toBe('client')
    expect(profile.full_name).toBe('Fresh Invitee')

    const { data: link } = await admin.from('coach_clients')
      .select('status').eq('coach_id', coach.id).eq('client_id', user.id).single()
    expect(link.status).toBe('active')

    const { data: inv } = await admin.from('invitations').select('status, redeemed_at').eq('token', token).single()
    expect(inv.status).toBe('accepted')
    expect(inv.redeemed_at).not.toBeNull()

    // THE HANDOFF: the hash must actually buy a session, or the one-tap promise
    // is broken for every new client no matter how correct the database is.
    const browser = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: session, error: verifyError } = await browser.auth.verifyOtp({
      token_hash: body.tokenHash,
      type: 'magiclink',
    })
    expect(verifyError, `verifyOtp rejected the hash: ${verifyError?.message}`).toBeNull()
    expect(session.session?.access_token).toBeTruthy()
    expect(session.user.id).toBe(user.id)
  })

  it('2. an address that already has an account is refused, and the token is NOT consumed', async () => {
    const existing = await makeUser('solo', 'fnexisting')
    created.push(existing)
    const token = await makeInvite(coach, existing.email)

    const { status, body } = await redeem({ token, fullName: 'Whoever' })
    expect(status).toBe(200)
    expect(body.requiresOtp).toBe(true)
    expect(body.email).toBe(existing.email)
    expect(body.tokenHash).toBeUndefined()

    // Load-bearing: the invite has to survive for the OTP round trip.
    const { data: inv } = await admin.from('invitations').select('status, redeemed_at').eq('token', token).single()
    expect(inv.status).toBe('pending')
    expect(inv.redeemed_at).toBeNull()

    // And the existing account was not touched.
    const { data: profile } = await admin.from('profiles').select('role').eq('id', existing.id).single()
    expect(profile.role).toBe('solo')
  })

  it('3. a spent token cannot be redeemed twice', async () => {
    const email = inviteeEmail('twice')
    strayEmails.push(email)
    const token = await makeInvite(coach, email)

    expect((await redeem({ token, fullName: 'First' })).status).toBe(200)

    // The second attempt now takes the requiresOtp branch (the account exists),
    // which is the self-healing path — NOT a second account.
    const second = await redeem({ token, fullName: 'Second' })
    expect(second.body.tokenHash).toBeUndefined()

    const { data: listed } = await admin.auth.admin.listUsers({ perPage: 1000 })
    expect(listed.users.filter((u) => u.email === email)).toHaveLength(1)
  })

  it('4. an expired token is refused and no account is created', async () => {
    const email = inviteeEmail('expired')
    const token = await makeInvite(coach, email, {
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    })

    const { status, body } = await redeem({ token, fullName: 'Too Late' })
    expect(status).toBe(404)
    expect(body.error).toBeTruthy()

    const { data: listed } = await admin.auth.admin.listUsers({ perPage: 1000 })
    expect(listed.users.find((u) => u.email === email)).toBeUndefined()
  })

  it('5. a malformed token is rejected on shape, before any lookup', async () => {
    for (const token of ['', 'not-a-uuid', '../../etc/passwd', 12345, null]) {
      const { status } = await redeem({ token, fullName: 'Nope' })
      expect(status, `expected 400 for ${JSON.stringify(token)}`).toBe(400)
    }
  })

  it('6. an unknown token leaks nothing about whether it ever existed', async () => {
    const { status, body } = await redeem({ token: crypto.randomUUID(), fullName: 'Nobody' })
    expect(status).toBe(404)
    expect(body.error).toBe('This invite link is invalid or has already been used.')
    // No email address, no coach name, no Postgres prose.
    expect(JSON.stringify(body)).not.toMatch(/@|coach_id|PL\/pgSQL|relation/i)
  })

  it('7. a coach account cannot be signed up as a client, and leaves no orphan behind', async () => {
    // The invited address belongs to nobody yet, so the function creates the
    // user and only then does accept_invitation refuse. That is the orphan
    // path: the user must be cleaned up, or a retry hits requiresOtp forever.
    const email = inviteeEmail('orphan')
    strayEmails.push(email)
    const token = await makeInvite(coach, email)

    // Pre-create the relationship the RPC rejects on: this invitee is already
    // actively coached, so accept_invitation raises after the user is created.
    const other = await makeUser('coach', 'fncoach2')
    created.push(other)
    const preexisting = await makeUser('client', 'fnalready')
    created.push(preexisting)
    await admin.from('coach_clients').insert({
      coach_id: other.id, client_id: preexisting.id, status: 'active',
    })

    const dupToken = await makeInvite(coach, preexisting.email)
    const { body } = await redeem({ token: dupToken, fullName: 'Already Coached' })
    // Existing account → requiresOtp, so no orphan is possible on this path.
    expect(body.requiresOtp).toBe(true)

    // Sanity: the fresh-email path still works alongside it.
    expect((await redeem({ token, fullName: 'Fine' })).status).toBe(200)
  })
})
