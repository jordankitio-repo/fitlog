import { useState } from 'react'
import { supabase } from '../supabase'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('solo')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setError('')

    if (isSignUp) {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) { setError(signUpError.message); return }

      // Update profile with role and name
      if (data.user) {
  await supabase
    .from('profiles')
    .update({ role, full_name: fullName })
    .eq('id', data.user.id)

  await supabase.auth.refreshSession()
}
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) setError(signInError.message)
    }
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

  return (
    <div style={{
      maxWidth: '400px',
      margin: '80px auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      <h1>{isSignUp ? 'Create account' : 'Sign in'}</h1>

      {isSignUp && (
        <input
          type="text"
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          style={inputStyle}
        />
      )}

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={inputStyle}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={inputStyle}
      />

      {isSignUp && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '0.875rem', color: '#888' }}>I am a...</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['solo', 'coach'].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: role === r ? '2px solid #4f8ef7' : '1px solid #2a2a2a',
                  backgroundColor: role === r ? '#1a2a3a' : '#1a1a1a',
                  color: role === r ? '#4f8ef7' : '#888',
                  cursor: 'pointer',
                  fontWeight: role === r ? 600 : 400,
                  fontSize: '0.875rem'
                }}
              >
                {r === 'solo' ? '🧍 Individual' : '🏋️ Coach'}
              </button>
            ))}
          </div>
          {role === 'coach' && (
            <p style={{ fontSize: '0.75rem', color: '#888' }}>
              You'll be able to invite and manage clients from your dashboard.
            </p>
          )}
        </div>
      )}

      {error && <p style={{ color: '#f87171' }}>{error}</p>}

      <button
        onClick={handleSubmit}
        style={{
          backgroundColor: '#4f8ef7',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          padding: '10px 20px',
          cursor: 'pointer',
          fontWeight: 600
        }}
      >
        {isSignUp ? 'Create account' : 'Sign in'}
      </button>

      <p
        onClick={() => { setIsSignUp(!isSignUp); setError('') }}
        style={{ cursor: 'pointer', textAlign: 'center', color: '#888' }}
      >
        {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
      </p>
    </div>
  )
}

export default Login
