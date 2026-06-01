import { useState } from 'react'
import { supabase } from '../supabase'
import Button from '../components/Button'
import { getPasswordValidationError } from '../utils/passwordValidation'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('solo')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotStatus, setForgotStatus] = useState('')

  async function handleSubmit() {
    setError('')
    const newErrors = {}

    if (isSignUp && !fullName.trim()) newErrors.fullName = 'Name is required.'
    if (!email.trim()) newErrors.email = 'Email is required.'
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Enter a valid email.'
    if (!password) newErrors.password = 'Password is required.'
    else if (isSignUp) {
      const passwordError = getPasswordValidationError(password)
      if (passwordError) newErrors.password = passwordError
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    setErrors({})

    if (isSignUp) {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) { setError(signUpError.message); return }
      if (data.user) {
        await supabase.from('profiles').update({ role, full_name: fullName }).eq('id', data.user.id)
        await supabase.auth.refreshSession()
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) setError(signInError.message)
    }
  }

  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })
  }

  async function handleForgotPassword() {
  if (!forgotEmail) return
  setForgotStatus('')

  const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
    redirectTo: `${window.location.origin}/reset-password`
  })

  if (error) setForgotStatus(error.message)
  else setForgotStatus('Check your email for a reset link.')
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
    <div className="page-fade-in" style={{
      maxWidth: '400px',
      margin: '80px auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      <h1>{isSignUp ? 'Create account' : 'Sign in'}</h1>

      {isSignUp && (
        <>
          <input
            type="text"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); setErrors(p => ({ ...p, fullName: '' })) }}
            style={{ ...inputStyle, borderColor: errors.fullName ? '#f87171' : '#2a2a2a' }}
          />
          {errors.fullName && <p style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '-8px' }}>{errors.fullName}</p>}
        </>
      )}

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '' })) }}
        style={{ ...inputStyle, borderColor: errors.email ? '#f87171' : '#2a2a2a' }}
      />
      {errors.email && <p style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '-8px' }}>{errors.email}</p>}
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '' })) }}
        style={{ ...inputStyle, borderColor: errors.password ? '#f87171' : '#2a2a2a' }}
      />
      {errors.password && <p style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '-8px' }}>{errors.password}</p>}

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

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-border)' }} />
        <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>or</span>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-border)' }} />
      </div>

      <button
        onClick={handleGoogleSignIn}
        style={{
          width: '100%',
          padding: '10px 20px',
          backgroundColor: '#fff',
          color: '#333',
          border: '1px solid #ddd',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px'
        }}
      >
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        Continue with Google
      </button>

      <Button onClick={handleSubmit} variant="primary" fullWidth>
        {isSignUp ? 'Create account' : 'Sign in'}
      </Button>

      {!isSignUp && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    {!showForgot ? (
      <p
        onClick={() => setShowForgot(true)}
        style={{ cursor: 'pointer', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.875rem' }}
      >
        Forgot password?
      </p>
    ) : (
      <>
        <input
          type="email"
          placeholder="Enter your email"
          value={forgotEmail}
          onChange={(e) => setForgotEmail(e.target.value)}
          style={inputStyle}
        />
        <Button onClick={handleForgotPassword} variant="muted" fullWidth>
          Send reset link
        </Button>
        {forgotStatus && (
          <p style={{ fontSize: '0.875rem', color: forgotStatus.includes('Check') ? 'var(--color-primary)' : '#f87171', textAlign: 'center' }}>
            {forgotStatus}
          </p>
        )}
        <p
          onClick={() => setShowForgot(false)}
          style={{ cursor: 'pointer', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.875rem' }}
        >
          Back to sign in
        </p>
      </>
    )}
  </div>
)}
      <p
        onClick={() => { setIsSignUp(!isSignUp); setError(''); setErrors({}) }}
        style={{ cursor: 'pointer', textAlign: 'center', color: '#888' }}
      >
        {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
      </p>
    </div>
  )
}

export default Login
