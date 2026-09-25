// Passwordless invite acceptance — see docs/passwordless-auth-design.md.
//
// The security model is an asymmetry: an invite token may CREATE an account for
// the address it was sent to, and may never ENTER an account that already
// exists. We deliberately ship no IP rate limiting on redemption, so single-use
// + expiry IS the defense — which makes the atomic claim inside
// accept_invitation load-bearing rather than a nicety. Tests 2 and 3 guard it.
//
// These exercise the RPCs, not the HTTP edge function: every guarantee lives in
// accept_invitation / auth_user_exists (SECURITY DEFINER, so they run as the
// table owner), and `redeem-invite` is thin orchestration over them.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { admin, makeUser, relate, cleanupUsers } from './helpers.js'
import { localEnv } from './env.js'

const HOUR = 60 * 60 * 1000

// A passwordless auth user, exactly as redeem-invite creates one: no password,
// email pre-confirmed. handle_new_user still gives it a role-less profile row.
async function makeInvitee(label) {
  const email = `rls.${label}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.test`
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (error) throw new Error(`createUser(${label}): ${error.message}`)
  return { id: data.user.id, email }
}

// Seeded AS THE COACH (authenticated + the "Coaches can manage their
// invitations" policy) — the same path the real app uses. service_role has no
// grant on this table and intentionally never gets one.
async function makeInvite(coach, clientEmail, { expiresAt } = {}) {
  const token = crypto.randomUUID()
  const row = { coach_id: coach.id, client_email: clientEmail, token }
  if (expiresAt) row.expires_at = expiresAt
  const { error } = await coach.client.from('invitations').insert(row)
  if (error) throw new Error(`seed invitation: ${error.message}`)
  return token
}

const acceptAsServer = (token, userId, fullName = null) =>
  admin.rpc('accept_invitation', { p_token: token, p_user_id: userId, p_full_name: fullName })

// Holding a transaction open across statements is impossible through PostgREST
// (each request gets its own transaction and it is committed before the
// response is sent), so the lock test below opens a direct postgres connection.
async function directConnection() {
  const { dbUrl } = localEnv()
  const conn = new pg.Client({ connectionString: dbUrl })
  await conn.connect()
  return conn
}

describe('passwordless invite acceptance', () => {
  let coach, otherCoach
  const created = []

  beforeAll(async () => {
    coach = await makeUser('coach', 'invcoach')
    otherCoach = await makeUser('coach', 'invcoach2')
    created.push(coach, otherCoach)
  })

  afterAll(async () => {
    await cleanupUsers(created)
  })

  it('1. links a brand-new invitee: client role, active coach, invite spent', async () => {
    const invitee = await makeInvitee('newclient')
    created.push(invitee)
    const token = await makeInvite(coach, invitee.email)

    const { error } = await acceptAsServer(token, invitee.id, 'New Client')
    expect(error).toBeNull()

    const { data: profile } = await admin
      .from('profiles').select('role, full_name').eq('id', invitee.id).single()
    expect(profile.role).toBe('client')
    expect(profile.full_name).toBe('New Client')

    const { data: link } = await admin
      .from('coach_clients').select('status').eq('client_id', invitee.id).single()
    expect(link.status).toBe('active')

    const { data: inv } = await coach.client
      .from('invitations').select('status, redeemed_at').eq('token', token).single()
    expect(inv.status).toBe('accepted')
    expect(inv.redeemed_at).not.toBeNull()
  })

  it('2. refuses a second redemption of the same token (single-use)', async () => {
    const invitee = await makeInvitee('twice')
    created.push(invitee)
    const token = await makeInvite(coach, invitee.email)

    const first = await acceptAsServer(token, invitee.id)
    expect(first.error).toBeNull()

    const second = await acceptAsServer(token, invitee.id)
    expect(second.error).not.toBeNull()
    expect(second.error.message).toContain('invite_already_used')
  })

  it('3. refuses a token another transaction is already claiming', async () => {
    // The one guarantee holding up single-use, tested deterministically.
    //
    // Firing N concurrent redemptions through PostgREST does NOT work as a
    // test: whether the transactions actually overlap is a timing accident, so
    // it passes against a function with no locking perhaps half the time —
    // false confidence, which is worse than no test. Instead, pin the
    // interleaving by hand: hold the invitation row mid-claim in one
    // transaction, start the real accept, and only then commit.
    //
    // With `for update` the accept blocks on the row, re-reads it after the
    // commit, sees redeemed_at set and refuses. Without it the accept reads the
    // older visible version, still sees 'pending', and sails through to a
    // second successful redemption.
    const invitee = await makeInvitee('race')
    created.push(invitee)
    const token = await makeInvite(coach, invitee.email)

    const conn = await directConnection()
    let pending
    try {
      await conn.query('begin')
      await conn.query(
        "update public.invitations set status = 'accepted', redeemed_at = now() where token::text = $1",
        [token],
      )

      // `.then()` is NOT decoration. supabase-js query builders are lazy
      // thenables: the HTTP request is not sent until something subscribes, so
      // `const p = admin.rpc(...)` on its own dispatches nothing and the call
      // would only reach the database at the `await` below — after the commit,
      // where it refuses for the wrong reason and the test passes even with the
      // lock removed. Calling .then() here forces it onto the wire NOW.
      pending = acceptAsServer(token, invitee.id).then((r) => r)
      // Long enough for that request to arrive and block on the held row.
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await conn.query('commit')
    } finally {
      await conn.query('rollback').catch(() => {})
      await conn.end()
    }

    const { error } = await pending
    expect(error).not.toBeNull()
    expect(error.message).toContain('invite_already_used')

    // Nothing was linked: the whole accept rolled back, not just the claim.
    const { data: rows } = await admin
      .from('coach_clients').select('id').eq('client_id', invitee.id)
    expect(rows).toHaveLength(0)
  })

  it('4. refuses an expired token', async () => {
    const invitee = await makeInvitee('expired')
    created.push(invitee)
    const token = await makeInvite(coach, invitee.email, {
      expiresAt: new Date(Date.now() - HOUR).toISOString(),
    })

    const { error } = await acceptAsServer(token, invitee.id)
    expect(error).not.toBeNull()
    expect(error.message).toContain('invite_expired')
  })

  it('4b. an expired or spent invite is invisible to the token lookup', async () => {
    const invitee = await makeInvitee('lookup')
    created.push(invitee)

    const expired = await makeInvite(coach, invitee.email, {
      expiresAt: new Date(Date.now() - HOUR).toISOString(),
    })
    const { data: expiredRow } = await admin.rpc('get_invitation_by_token', { p_token: expired })
    expect(expiredRow).toHaveLength(0)

    const live = await makeInvite(coach, invitee.email)
    const { data: liveRow } = await admin.rpc('get_invitation_by_token', { p_token: live })
    expect(liveRow).toHaveLength(1)

    await acceptAsServer(live, invitee.id)
    const { data: spentRow } = await admin.rpc('get_invitation_by_token', { p_token: live })
    expect(spentRow).toHaveLength(0)
  })

  it('5. an existing account is detectable, and the check is server-only', async () => {
    // This is what routes redeem-invite to the OTP branch instead of minting a
    // session — the single check standing between a forwarded invite link and
    // takeover of an existing account.
    const { data: exists } = await admin.rpc('auth_user_exists', { p_email: coach.email })
    expect(exists).toBe(true)

    const { data: absent } = await admin.rpc('auth_user_exists', {
      p_email: `nobody.${Date.now()}@example.test`,
    })
    expect(absent).toBe(false)

    // A signed-in user must not be able to probe which addresses have accounts.
    const { error } = await coach.client.rpc('auth_user_exists', { p_email: coach.email })
    expect(error).not.toBeNull()
  })

  it('5b. a signed-in caller cannot accept on someone else\'s behalf', async () => {
    // p_user_id is honoured only for service_role; everyone else is auth.uid().
    // Without that, any authenticated user could pass a victim's id and bind
    // them to a coach.
    const victim = await makeInvitee('victim')
    created.push(victim)
    const token = await makeInvite(coach, victim.email)

    const solo = await makeUser('solo', 'impostor')
    created.push(solo)

    const { error } = await solo.client.rpc('accept_invitation', {
      p_token: token,
      p_user_id: victim.id,
    })
    expect(error).not.toBeNull()
    expect(error.message).toContain('invite_email_mismatch')

    const { data: rows } = await admin
      .from('coach_clients').select('id').eq('client_id', victim.id)
    expect(rows).toHaveLength(0)
  })

  it('6. refuses a coach account', async () => {
    const token = await makeInvite(otherCoach, coach.email)

    const { error } = await acceptAsServer(token, coach.id)
    expect(error).not.toBeNull()
    expect(error.message).toContain('coach_cannot_accept')
  })

  it('7. refuses a client who already has an active coach', async () => {
    const invitee = await makeInvitee('taken')
    created.push(invitee)
    await admin.from('profiles').upsert({ id: invitee.id, email: invitee.email, role: 'client' })
    await relate(otherCoach.id, invitee.id, 'active')

    const token = await makeInvite(coach, invitee.email)
    const { error } = await acceptAsServer(token, invitee.id)
    expect(error).not.toBeNull()
    expect(error.message).toContain('already_coached')
  })

  it('8. refuses an unknown token without revealing anything', async () => {
    const invitee = await makeInvitee('unknown')
    created.push(invitee)

    const { error } = await acceptAsServer(crypto.randomUUID(), invitee.id)
    expect(error).not.toBeNull()
    expect(error.message).toContain('invite_not_found')
    // The symbol must not carry an email, a coach, or an existence hint — the
    // edge function maps every dead-invite case onto one generic sentence.
    expect(error.message).not.toContain('@')
  })
})
