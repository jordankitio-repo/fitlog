const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Same copy for "never existed", "already used" and "revoked" — the three are
// indistinguishable to a stranger and there is nothing useful to tell them apart.
const DEAD_INVITE = 'This invite link is invalid or has already been used.'

// Maps a raised exception from accept_invitation onto an HTTP status + copy the
// Join page can show verbatim. Anything unrecognised becomes a generic 500 so a
// Postgres error string never reaches the browser.
function mapAcceptError(message: string): { status: number; error: string } {
  if (message.includes('invite_not_found'))      return { status: 404, error: DEAD_INVITE }
  if (message.includes('invite_already_used'))   return { status: 410, error: DEAD_INVITE }
  if (message.includes('invite_expired'))        return { status: 410, error: 'This invite link has expired. Ask your coach to send a new one.' }
  if (message.includes('invite_email_mismatch')) return { status: 403, error: 'This invite was sent to a different email address.' }
  if (message.includes('coach_cannot_accept'))   return { status: 403, error: 'This email belongs to a coach account and cannot accept a client invite.' }
  if (message.includes('already_coached'))       return { status: 403, error: 'You are already connected to a coach.' }
  return { status: 500, error: 'Could not accept this invite. Please try again.' }
}

// Redeem a coach's invite token for a signed-in session, WITHOUT a password.
//
// The token is a 122-bit uuid that only reached the invitee's inbox, so holding
// it proves control of that mailbox — the same proof an emailed OTP gives us.
// We spend that proof directly, but only one way:
//
//   * email has NO account  -> create it and mint a session. One tap, no email.
//   * email HAS an account  -> refuse, and tell the caller to do an OTP round
//                              trip first. A forwarded invite must never be
//                              able to walk into somebody's existing account.
//
// Nothing is consumed on the requiresOtp branch: the token has to survive for
// the client to come back and finish. The actual accept (claim the token, set
// the role, link the coach) is one atomic RPC — see the migration
// 20260825000000_passwordless_invites.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { token, fullName } = await req.json()
    if (typeof token !== 'string' || !UUID_RE.test(token)) {
      return jsonResponse({ error: DEAD_INVITE }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const svcHeaders = {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    }

    // --- 1. Peek the invite. No mutation yet. --------------------------------
    // Same token-gated SECURITY DEFINER lookup the Join page uses (it now also
    // filters out expired and already-redeemed rows).
    const invRes = await fetch(`${supabaseUrl}/rest/v1/rpc/get_invitation_by_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ p_token: token }),
    })
    const invRows = await invRes.json().catch(() => [])
    const invite = Array.isArray(invRows) ? invRows[0] : null
    if (!invite) return jsonResponse({ error: DEAD_INVITE }, 404)

    const email: string = invite.client_email

    // --- 2. Does this address already have an account? -----------------------
    // Live check against auth.users, so the `account_exists` flag the coach
    // snapshotted at invite time is advisory only and can no longer go stale.
    const existsRes = await fetch(`${supabaseUrl}/rest/v1/rpc/auth_user_exists`, {
      method: 'POST',
      headers: svcHeaders,
      body: JSON.stringify({ p_email: email }),
    })
    if (!existsRes.ok) {
      console.error('auth_user_exists failed:', existsRes.status, await existsRes.text())
      return jsonResponse({ error: 'Could not accept this invite. Please try again.' }, 500)
    }
    const accountExists = await existsRes.json().catch(() => null)

    if (accountExists === true) {
      // Hand the flow back to the browser: it signs in with an emailed 6-digit
      // code, then calls accept_invitation() itself as the authenticated user.
      return jsonResponse({ requiresOtp: true, email })
    }

    // --- 3. Brand-new account. Create it with NO password. -------------------
    // Deliberately no `role` in user_metadata: handle_new_user whitelists role
    // to ('coach','solo') because 'client' is invite-only and self-serve signup
    // metadata must never be able to claim it. accept_invitation sets the role
    // with the service role instead, so that trigger stays untouched.
    const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: svcHeaders,
      body: JSON.stringify({
        email,
        email_confirm: true,
        user_metadata: { full_name: typeof fullName === 'string' ? fullName.trim() : '' },
      }),
    })
    const created = await createRes.json().catch(() => ({}))
    if (!createRes.ok || !created?.id) {
      console.error('admin createUser failed:', createRes.status, JSON.stringify(created))
      return jsonResponse({ error: 'Could not create your account. Please try again.' }, 500)
    }
    const userId: string = created.id

    // --- 4. Claim the token + link the coach, atomically. --------------------
    let acceptRes: Response
    try {
      acceptRes = await fetch(`${supabaseUrl}/rest/v1/rpc/accept_invitation`, {
        method: 'POST',
        headers: svcHeaders,
        body: JSON.stringify({
          p_token: token,
          p_user_id: userId,
          p_full_name: typeof fullName === 'string' ? fullName.trim() : null,
        }),
      })
    } catch (e) {
      // The request never completed, so we CANNOT tell whether the transaction
      // committed. Leave the user in place rather than risk deleting a client
      // who is actually linked: a retry takes the requiresOtp branch above and
      // finishes through the same RPC. Self-healing, at the cost of one shell
      // account if it really did fail.
      console.error('accept_invitation did not complete:', e)
      return jsonResponse({ error: 'Could not accept this invite. Please try again.' }, 500)
    }

    if (!acceptRes.ok) {
      // We got a definite answer: the transaction rolled back. The user we just
      // created is an orphan with no profile and no coach — remove it so a
      // retry can take the clean path instead of hitting requiresOtp forever.
      const body = await acceptRes.json().catch(() => ({}))
      const message = String(body?.message ?? '')
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: svcHeaders,
      }).catch((e) => console.error('orphan cleanup failed:', e))

      const mapped = mapAcceptError(message)
      if (mapped.status === 500) console.error('accept_invitation failed:', message)
      return jsonResponse({ error: mapped.error }, mapped.status)
    }

    // --- 5. Mint the session. ------------------------------------------------
    // The admin endpoint RETURNS the link rather than mailing it, so this sends
    // no email. The hashed_token goes back over TLS to the holder of the invite
    // token — the same party, no weaker than the credential they already had.
    const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: svcHeaders,
      body: JSON.stringify({ type: 'magiclink', email }),
    })
    const link = await linkRes.json().catch(() => ({}))
    const tokenHash = link?.hashed_token ?? link?.properties?.hashed_token
    if (!linkRes.ok || !tokenHash) {
      // The account IS created and linked at this point — only the session
      // handoff failed. Send them to the OTP path rather than stranding them.
      console.error('generate_link failed:', linkRes.status, JSON.stringify(link))
      return jsonResponse({ requiresOtp: true, email })
    }

    return jsonResponse({ tokenHash, email })

  } catch (error) {
    console.error('redeem-invite threw:', error)
    return jsonResponse({ error: 'Could not accept this invite. Please try again.' }, 500)
  }
})
