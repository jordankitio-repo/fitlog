import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

function Join() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [invitation, setInvitation] = useState(null)
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token) fetchInvitation()
    else setLoading(false)
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
    </div>
  )
}

export default Join
