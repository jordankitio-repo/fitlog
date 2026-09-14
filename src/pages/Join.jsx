import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import Button from '../components/Button'
import Logo from '../components/Logo'
import LoadingScreen from '../components/LoadingScreen'
import { inviteErrorMessage, DEAD_INVITE } from '../utils/inviteErrors'

// Accepting a coach's invite, without a password.
//
// The token in the URL only ever reached the invitee's inbox, so holding it
// proves control of that mailbox. `redeem-invite` spends that proof directly —
// but only for an email with no account yet, so a forwarded link can create an
// account and never enter one. An invitee who DOES already have an account
// does a 6-digit code round trip first, then accepts as themselves.
//
// Three ways in, one atomic accept (accept_invitation) behind all of them:
//   'accept'  — no session: name + one button (the common case, brand-new client)
//   'code'    — that address already had an account: enter the emailed code
//   'connect' — already signed in in this browser: one confirm
function Join() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const urlToken = searchParams.get('token')

  const [invitation, setInvitation] = useState(null)
  const [coachName, setCoachName] = useState('')
  const [fullName, setFullName] = useState('')
  const [code, setCode] = useState('')
  const [mode, setMode] = useState('accept')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [existingSession, setExistingSession] = useState(null)

  async function fetchInvitation(activeToken) {
    // Token-gated SECURITY DEFINER lookup — the invitations table is not
    // readable by anon. It now also filters out expired and already-redeemed
    // invites, so a dead link fails here rather than at redemption.
    const { data, error: inviteError } = await supabase
      .rpc('get_invitation_by_token', { p_token: activeToken })
      .maybeSingle()

    if (inviteError || !data) {
      setError(DEAD_INVITE)
      setLoading(false)
      return
    }

    setInvitation(data)

    // Best-effort: personalize with the inviting coach's name. profiles RLS
    // hides it from this anonymous visitor, so an edge function returns it.
    // Fire-and-forget — never blocks accepting the invite.
    supabase.functions.invoke('invite-info', { body: { token: activeToken } })
      .then(({ data: info }) => { if (info?.coachName) setCoachName(info.coachName) })
      .catch(() => {})

    setLoading(false)
  }

  useEffect(() => {
    async function init() {
      setLoading(true)

      const { data: { session } } = await supabase.auth.getSession()
      if (session) setExistingSession(session)

      if (!urlToken) {
        setError('This invite link is missing a token.')
        setLoading(false)
        return
      }
      await fetchInvitation(urlToken)
    }

    init()
  }, [urlToken])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setExistingSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // A solo user who becomes a client stops paying for solo. Only reachable on
  // the paths where an account already existed — a user created seconds ago by
  // redeem-invite has nothing to pause.
  async function pauseSoloSubscription() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pause-solo-subscription`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      )
    } catch (e) {
      console.error('Failed to pause solo subscription:', e)
    }
  }

  // Shared tail for the two paths that finish in the browser as an authenticated
  // user. The RPC is atomic: it claims the token, sets the client role and links
  // the coach in one transaction, or does none of it.
  async function acceptAsCurrentUser() {
    const { error: rpcError } = await supabase.rpc('accept_invitation', { p_token: urlToken })
    if (rpcError) {
      setError(inviteErrorMessage(rpcError.message))
      return false
    }
    await pauseSoloSubscription()
    await supabase.auth.refreshSession()
    navigate('/')
    return true
  }

  async function handleAccept() {
    if (!fullName.trim()) {
      setError('Please enter your name.')
      return
    }

    setBusy(true)
    setError('')

    let payload
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redeem-invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ token: urlToken, fullName: fullName.trim() }),
        },
      )
      payload = await res.json()
      if (!res.ok) {
        setError(inviteErrorMessage(payload?.error))
        setBusy(false)
        return
      }
    } catch {
      setError('Unable to connect to our servers. Please try again in a few minutes.')
      setBusy(false)
      return
    }

    // That address already has an account. The token was NOT spent — prove the
    // mailbox with a code, then accept as the signed-in user.
    if (payload.requiresOtp) {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: payload.email,
        // Never create an account from this call: redeem-invite owns account
        // creation, and shouldCreateUser would turn a typo into a live user.
        options: { shouldCreateUser: false },
      })
      if (otpError) setError(otpError.message)
      else setMode('code')
      setBusy(false)
      return
    }

    // Brand-new account: exchange the returned hash for a real session.
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: payload.tokenHash,
      type: 'magiclink',
    })
    if (verifyError) {
      setError(verifyError.message)
      setBusy(false)
      return
    }

    await supabase.auth.refreshSession()
    setBusy(false)
    navigate('/')
  }

  async function handleVerifyCode() {
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from your email.')
      return
    }

    setBusy(true)
    setError('')

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: invitation.client_email,
      token: code.trim(),
      type: 'email',
    })
    if (verifyError) {
      setError('That code is incorrect or has expired.')
      setBusy(false)
      return
    }

    await acceptAsCurrentUser()
    setBusy(false)
  }

  async function handleConnect() {
    if (!existingSession) return
    const sessionEmail = existingSession.user.email?.toLowerCase()
    const invitedEmail = invitation.client_email?.toLowerCase()

    if (sessionEmail !== invitedEmail) {
      setError(`Log in with ${invitation.client_email} to accept this invite.`)
      return
    }

    setBusy(true)
    setError('')
    await acceptAsCurrentUser()
    setBusy(false)
  }

  const inputStyle = {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    color: 'var(--color-text)',
    fontSize: 'var(--text-body)',
    width: '100%',
  }

  if (loading) return <LoadingScreen />

  if (error && !invitation) return (
    <div style={{ maxWidth: '400px', margin: '80px auto' }}>
      <p style={{ color: 'var(--color-error)' }}>{error}</p>
    </div>
  )

  const errorLine = error
    ? <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-base)', margin: 0 }}>{error}</p>
    : null

  return (
    <div style={{
      maxWidth: '400px',
      margin: '80px auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    }}>
      <Logo size={40} />
      <h1 style={{ margin: 0 }}>
        {coachName ? `${coachName} invited you to Gardnr` : "You're invited to Gardnr"}
      </h1>
      <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-base)', lineHeight: 1.6, margin: 0 }}>
        Log your meals and progress here, and {coachName || 'your coach'} sees it and guides you week to week.
        It's free for you — your coach covers it.
      </p>
      <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-base)', margin: 0 }}>
        Your email: <strong style={{ color: 'var(--color-text)' }}>{invitation?.client_email}</strong>
      </p>

      {existingSession ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', margin: 0 }}>
            You're logged in as <strong>{existingSession.user.email}</strong>. Accepting this invite will connect you to your coach as a client. Your existing data is preserved.
          </p>
          {errorLine}
          <Button onClick={handleConnect} variant="primary" loading={busy}>
            Accept invite
          </Button>
          <Button onClick={() => navigate('/')} variant="ghost">
            Cancel
          </Button>
        </div>
      ) : mode === 'code' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', margin: 0 }}>
            You already have a Gardnr account with this email. We sent a 6-digit code to{' '}
            <strong style={{ color: 'var(--color-text)' }}>{invitation?.client_email}</strong> — enter it to accept.
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            style={{ ...inputStyle, letterSpacing: '0.4em', textAlign: 'center', fontSize: 'var(--text-lg)' }}
          />
          {errorLine}
          <Button onClick={handleVerifyCode} variant="primary" fullWidth loading={busy}>
            Accept invite
          </Button>
        </div>
      ) : (
        <>
          <input
            type="text"
            placeholder="Your full name"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={inputStyle}
          />

          {errorLine}

          <Button onClick={handleAccept} variant="primary" fullWidth loading={busy}>
            Accept invite
          </Button>

          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 'var(--text-xs)', color: 'var(--color-muted)', lineHeight: 1.6 }}>
            By accepting, you confirm you're 18+ and agree to our{' '}
            <Link to="/terms" style={{ color: 'var(--color-primary)' }}>Terms of Service</Link>
            {' '}and{' '}
            <Link to="/privacy" style={{ color: 'var(--color-primary)' }}>Privacy Policy</Link>.
          </p>
        </>
      )}
    </div>
  )
}

export default Join
