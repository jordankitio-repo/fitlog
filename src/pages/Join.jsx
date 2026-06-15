import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import Button from '../components/Button'
import Logo from '../components/Logo'
import PasswordInput from '../components/PasswordInput'
import { getPasswordValidationError } from '../utils/passwordValidation'

function Join() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const urlToken = searchParams.get('token')

  const [inviteToken, setInviteToken] = useState(urlToken || '')
  const [invitation, setInvitation] = useState(null)
  const [existingAccount, setExistingAccount] = useState(null)
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [existingSession, setExistingSession] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  // Set when sign-up reports the email already exists. We can't pre-detect this
  // because profiles RLS hides every row from an unauthenticated visitor, so the
  // "create account" form is shown by default and we pivot here on the error.
  const [accountExists, setAccountExists] = useState(false)

  useEffect(() => {
    async function init() {
      setLoading(true)
      const activeToken = urlToken
      setInviteToken(activeToken || '')

      const { data: { session } } = await supabase.auth.getSession()
      if (session) setExistingSession(session)

      if (activeToken) await fetchInvitation(activeToken)
      else {
        setError('This invite link is missing a token.')
        setLoading(false)
      }
    }

    init()
  }, [urlToken])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setExistingSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchInvitation(activeToken) {
    const { data, error: inviteError } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', activeToken)
      .eq('status', 'pending')
      .single()

    if (inviteError || !data) {
      setError('This invite link is invalid or has already been used.')
      setLoading(false)
      return
    }

    setInvitation(data)

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('email', data.client_email)
      .maybeSingle()

    setExistingAccount(existingProfile || null)
    setLoading(false)
  }

  async function handleSignUp() {
    if (!fullName.trim() || !password) {
      setError('Please fill in all fields.')
      return
    }

    const passwordError = getPasswordValidationError(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    if (existingAccount) {
      setError('This email already has a Gardnr account. Log in to accept your coach\'s invite.')
      return
    }

    setAuthLoading(true)
    setError('')

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: invitation.client_email,
      password,
    })

    if (signUpError) {
      // Returning user (e.g. a client who left coaching and went back to solo).
      // Their auth account still exists, so sign-up fails — pivot to sign-in.
      if (/already registered|already exists/i.test(signUpError.message || '')) {
        setAccountExists(true)
        setPassword('')
        setError("You already have a Gardnr account with this email. Enter your password to sign in and accept.")
        setAuthLoading(false)
        return
      }
      setError(signUpError.message)
      setAuthLoading(false)
      return
    }

    await acceptInvite(data.user.id, { fullName: fullName.trim() })
    setAuthLoading(false)
  }

  async function handleLoginToAccept() {
    if (!password) {
      setError('Enter your password to accept this invite.')
      return
    }

    setAuthLoading(true)
    setError('')

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: invitation.client_email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setAuthLoading(false)
      return
    }

    await acceptInvite(data.user.id)
    setAuthLoading(false)
  }

  async function acceptInvite(userId, options = {}) {
    setConnecting(true)
    setError('')

    // Now authenticated, so we can read our own profile — guard against a coach
    // account accepting a client invite (the anon pre-check couldn't see this).
    const { data: ownProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (ownProfile?.role === 'coach') {
      setError('This email belongs to a coach account and cannot accept a client invite.')
      setConnecting(false)
      return
    }

    const { data: existingRelation } = await supabase
      .from('coach_clients')
      .select('id')
      .eq('client_id', userId)
      .eq('status', 'active')
      .maybeSingle()

    if (existingRelation) {
      setError('You are already connected to a coach.')
      setConnecting(false)
      return
    }

    const profilePayload = {
      id: userId,
      email: invitation.client_email,
      role: 'client',
    }

    if (options.fullName) profilePayload.full_name = options.fullName

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(profilePayload)

    if (profileError) {
      setError(profileError.message)
      setConnecting(false)
      return
    }

    const { error: relationshipError } = await supabase
      .from('coach_clients')
      .upsert({
        coach_id: invitation.coach_id,
        client_id: userId,
        status: 'active',
        offboarded_at: null,
        lock_cleared_at: null,
      }, { onConflict: 'coach_id,client_id' })

    if (relationshipError) {
      setError(relationshipError.message)
      setConnecting(false)
      return
    }

    const { error: invitationError } = await supabase
      .from('invitations')
      .update({ status: 'accepted' })
      .eq('token', inviteToken)

    if (invitationError) {
      setError(invitationError.message)
      setConnecting(false)
      return
    }

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (currentSession?.access_token) {
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pause-solo-subscription`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${currentSession.access_token}`,
            },
          },
        )
      }
    } catch (e) {
      console.error('Failed to pause solo subscription:', e)
    }

    await supabase.auth.refreshSession()
    setConnecting(false)
    navigate('/')
  }

  async function handleConnect() {
    if (!existingSession) return
    const sessionEmail = existingSession.user.email?.toLowerCase()
    const invitedEmail = invitation.client_email?.toLowerCase()

    if (sessionEmail !== invitedEmail) {
      setError(`Log in with ${invitation.client_email} to accept this invite.`)
      return
    }

    if (existingAccount?.role === 'coach') {
      setError('This email belongs to a coach account and cannot accept a client invite.')
      return
    }

    await acceptInvite(existingSession.user.id)
  }

  const inputStyle = {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    color: 'var(--color-text)',
    fontSize: '1rem',
    width: '100%',
  }

  if (loading) return <p style={{ padding: '24px' }}>Loading...</p>

  if (error && !invitation) return (
    <div style={{ maxWidth: '400px', margin: '80px auto' }}>
      <p style={{ color: '#f87171' }}>{error}</p>
    </div>
  )

  return (
    <div style={{
      maxWidth: '400px',
      margin: '80px auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    }}>
      <Logo size={40} />
      <h1>Accept invitation</h1>
      <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>
        You've been invited to join Gardnr as a coached client.
        Your email: <strong style={{ color: 'var(--color-text)' }}>{invitation?.client_email}</strong>
      </p>

      {existingAccount?.role === 'coach' ? (
        <p style={{ color: '#f87171', fontSize: '0.875rem' }}>
          This email belongs to a coach account and cannot accept a client invite.
        </p>
      ) : existingSession ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
            You're logged in as <strong>{existingSession.user.email}</strong>. Accepting this invite will connect you to your coach as a client. Your existing data is preserved.
          </p>
          {error && <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{error}</p>}
          <Button onClick={handleConnect} variant="primary" loading={connecting}>
            Accept invite
          </Button>
          <Button onClick={() => navigate('/')} variant="ghost">
            Cancel
          </Button>
        </div>
      ) : (existingAccount || accountExists) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
            You already have a Gardnr account with this email. Log in to accept your coach's invite.
          </p>
          <PasswordInput
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
          {error && <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{error}</p>}
          <Button onClick={handleLoginToAccept} variant="primary" fullWidth loading={authLoading || connecting}>
            Log in and accept
          </Button>
          <p style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
            Forgot your password? <Link to="/login" style={{ color: 'var(--color-primary)' }}>Reset it</Link>, then reopen this invite link.
          </p>
        </div>
      ) : (
        <>
          <input
            type="text"
            placeholder="Your full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={inputStyle}
          />
          <PasswordInput
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />

          {error && <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{error}</p>}

          <Button onClick={handleSignUp} variant="primary" fullWidth loading={authLoading || connecting}>
            Create account
          </Button>

          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 'var(--text-xs)', color: 'var(--color-muted)', lineHeight: 1.6 }}>
            By creating an account, you confirm you're 18+ and agree to our{' '}
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
