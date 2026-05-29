import { useState } from 'react'
import { supabase } from '../supabase'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setError('')
    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })

    if (error) setError(error.message)
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

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          backgroundColor: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: '10px 14px',
          color: 'var(--color-text)',
          fontSize: '1rem'
        }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{
          backgroundColor: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: '10px 14px',
          color: 'var(--color-text)',
          fontSize: '1rem'
        }}
      />

      {error && <p style={{ color: '#f87171' }}>{error}</p>}

      <button
        onClick={handleSubmit}
        style={{
          backgroundColor: 'var(--color-primary)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--radius)',
          padding: '10px 20px',
          cursor: 'pointer',
          fontWeight: 600
        }}
      >
        {isSignUp ? 'Create account' : 'Sign in'}
      </button>

      <p
        onClick={() => setIsSignUp(!isSignUp)}
        style={{ cursor: 'pointer', textAlign: 'center' }}
      >
        {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
      </p>
    </div>
  )
}

export default Login