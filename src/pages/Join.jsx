import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Button from '../components/Button'

function Join() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [invitation, setInvitation] = useState(null)
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [existingSession, setExistingSession] = useState(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      console.log('session check', session?.user?.email)
      if (session) setExistingSession(session)
      if (token) await fetchInvitation()
      else setLoading(false)
    }
    init()
  }, [token])

  async function fetchInvitation() {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .single()

    if (error || !data) {
      setError('This invite link is invalid or has already been used.')
    } else {
      setInvitation(data)
    }
    setLoading(false)
  }

  async function handleSignUp() {
    if (!fullName || !password) { setError('Please fill in all fields.'); return }
    setError('')

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: invitation.client_email,
      password
    })

    if (signUpError) { setError(signUpError.message); return }

    const userId = data.user.id

    await supabase
  .from('profiles')
  .upsert({
    id: userId,
    email: invitation.client_email,
    full_name: fullName,
    role: 'client'
  })

    await supabase
      .from('coach_clients')
      .insert([{
        coach_id: invitation.coach_id,
        client_id: userId,
        status: 'active'
      }])

    await supabase
      .from('invitations')
      .update({ status: 'accepted' })
      .eq('token', token)

    navigate('/')
  }

  async function handleConnect() {
    if (!existingSession) return
    setConnecting(true)
    setError('')

    const userId = existingSession.user.id

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

    // Update role to client
    await supabase
      .from('profiles')
      .update({ role: 'client' })
      .eq('id', userId)

    // Create coach-client relationship
    await supabase
      .from('coach_clients')
      .insert([{
        coach_id: invitation.coach_id,
        client_id: userId,
        status: 'active'
      }])

    // Mark invite as accepted
    await supabase
      .from('invitations')
      .update({ status: 'accepted' })
      .eq('token', token)

    setConnecting(false)
    navigate('/')
  }

  const inputStyle = {
    backgroundColor: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#f0f0f0',
    fontSize: '1rem',
    width: '100%'
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
      gap: '16px'
    }}>
      <h1>Accept invitation</h1>
      <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>
        You've been invited to join FitLog as a coached client.
        Your email: <strong style={{ color: 'var(--color-text)' }}>{invitation?.client_email}</strong>
      </p>

      {existingSession ? (
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
      ) : (
        <>
          <input
            type="text"
            placeholder="Your full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />

          {error && <p style={{ color: '#f87171' }}>{error}</p>}

          <button onClick={handleSignUp} style={{
            backgroundColor: '#4f8ef7',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 20px',
            cursor: 'pointer',
            fontWeight: 600
          }}>
            Create account
          </button>
        </>
      )}
    </div>
  )
}

export default Join
