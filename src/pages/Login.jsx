import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import Button from '../components/Button'
import Logo from '../components/Logo'
import { getPasswordValidationError } from '../utils/passwordValidation'

function Login() {
  const [searchParams] = useSearchParams()
  const requestedRole = searchParams.get('role')
  const initialRole = requestedRole === 'coach' || requestedRole === 'solo' ? requestedRole : 'solo'
  const initialIsSignUp = searchParams.get('mode') === 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState(initialRole)
  const [isSignUp, setIsSignUp] = useState(initialIsSignUp)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotStatus, setForgotStatus] = useState('')

  function friendlyError(message) {
    if (!message || message === 'Failed to fetch' || message.toLowerCase().includes('networkerror') || message.toLowerCase().includes('failed to fetch')) {
      return 'Unable to connect to our servers. Please try again in a few minutes.'
    }
    return message
  }

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

    try {
      if (isSignUp) {
        const { data: existing } = await supabase
          .from('profiles')
          .select('id, role')
          .eq('email', email.trim().toLowerCase())
          .maybeSingle()

        if (existing) {
          setError('An account with this email already exists. Sign in instead.')
          return
        }

        const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
        if (signUpError) {
          setError(friendlyError(signUpError.message))
          return
        }
        if (data.user) {
          const { error: profileError } = await supabase.from('profiles').upsert({
            id: data.user.id,
            email: email.trim().toLowerCase(),
            role,
            full_name: fullName,
          })
          if (profileError) {
            setError(friendlyError(profileError.message))
            return
          }
          await supabase.auth.refreshSession()
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) setError(friendlyError(signInError.message))
      }
    } catch {
      setError('Unable to connect to our servers. Please try again in a few minutes.')
    }
  }

  async function handleForgotPassword() {
    if (!forgotEmail) return
    setForgotStatus('')

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`
      })
      if (error) setForgotStatus(friendlyError(error.message))
      else setForgotStatus('Check your email for a reset link.')
    } catch {
      setForgotStatus('Unable to connect. Please try again in a few minutes.')
    }
  }

  const inputStyle = {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    color: 'var(--color-text)',
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
      <Link to="/" aria-label="Gardnr home"><Logo size={40} /></Link>
      <h1>{isSignUp ? 'Create account' : 'Sign in'}</h1>

      {isSignUp && (
        <>
          <input
            type="text"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); setErrors(p => ({ ...p, fullName: '' })) }}
            style={{ ...inputStyle, borderColor: errors.fullName ? '#f87171' : 'var(--color-border)' }}
          />
          {errors.fullName && <p style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '-8px' }}>{errors.fullName}</p>}
        </>
      )}

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '' })) }}
        style={{ ...inputStyle, borderColor: errors.email ? '#f87171' : 'var(--color-border)' }}
      />
      {errors.email && <p style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '-8px' }}>{errors.email}</p>}
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '' })) }}
        style={{ ...inputStyle, borderColor: errors.password ? '#f87171' : 'var(--color-border)' }}
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
                  borderRadius: 'var(--radius)',
                  border: role === r ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  backgroundColor: role === r ? '#1a2a3a' : 'var(--color-surface)',
                  color: role === r ? 'var(--color-primary)' : 'var(--color-muted)',
                  cursor: 'pointer',
                  fontWeight: role === r ? 600 : 400,
                  fontSize: '0.875rem'
                }}
              >
                {r === 'solo' ? 'Individual' : 'Coach'}
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
      <p style={{ textAlign: 'center', marginTop: 16, fontSize: 'var(--text-xs)', color: 'var(--color-muted)', lineHeight: 1.6 }}>
        By signing up, you agree to our{' '}
        <Link to="/terms" style={{ color: 'var(--color-primary)' }}>Terms of Service</Link>
        {' '}and{' '}
        <Link to="/privacy" style={{ color: 'var(--color-primary)' }}>Privacy Policy</Link>.
      </p>
    </div>
  )
}

export default Login
