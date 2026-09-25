import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { track } from '@vercel/analytics'
import { supabase } from '../supabase'
import { SIGNED_OUT_REASON_KEY } from '../hooks/useSessionPolicy'
import Button from '../components/Button'
import Logo from '../components/Logo'
import PasswordInput from '../components/PasswordInput'
import { getPasswordValidationError } from '../utils/passwordValidation'
import { controlStyle } from '../components/ui'

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
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotStatus, setForgotStatus] = useState('')
  // Passwordless sign-in. Clients created by an invite have no password at all,
  // so this is their only door back in after a session ends — not a convenience.
  const [otpStage, setOtpStage] = useState('none') // 'none' | 'email' | 'code'
  const [otpEmail, setOtpEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpStatus, setOtpStatus] = useState('')
  const [otpBusy, setOtpBusy] = useState(false)

  useEffect(() => {
    if (searchParams.get('mode') === 'signup' && searchParams.get('role') === 'coach') {
      track('signup_started')
    }
  }, [searchParams])

  // A policy sign-out is otherwise indistinguishable from a bug. Read it once,
  // then clear it so it doesn't reappear on the next visit.
  const [signedOutReason] = useState(() => {
    try {
      const reason = localStorage.getItem(SIGNED_OUT_REASON_KEY)
      if (reason) localStorage.removeItem(SIGNED_OUT_REASON_KEY)
      return reason || ''
    } catch { return '' }
  })

  function friendlyError(message) {
    if (!message || message === 'Failed to fetch' || message.toLowerCase().includes('networkerror') || message.toLowerCase().includes('failed to fetch')) {
      return 'Unable to connect to our servers. Please try again in a few minutes.'
    }
    // A duplicate signup returns Supabase's raw "User already registered". The
    // client-side profiles pre-check can't catch it (RLS hides other users'
    // rows from anon), so rewrite the server error to our sign-in guidance.
    if (message.toLowerCase().includes('already registered')) {
      return 'An account with this email already exists. Sign in instead.'
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
    if (isSignUp && !agreed) newErrors.agreed = 'Please confirm you are 18+ and agree to the Terms and Privacy Policy.'

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

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          // Pass role + name in signup metadata so the handle_new_user trigger
          // assigns them atomically with the auth user. The profile upsert below
          // stays as a safety net, but the role no longer depends on it running.
          options: { data: { role, full_name: fullName } },
        })
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

  const NEUTRAL_CODE_SENT = "If that email has an account, we've sent a 6-digit code."

  async function sendLoginCode() {
    const target = otpEmail.trim()
    if (!/\S+@\S+\.\S+/.test(target)) { setOtpStatus('Enter a valid email.'); return }

    setOtpBusy(true)
    setOtpStatus('')
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: target,
        // MUST stay false. Without it this endpoint silently creates an account
        // for any address typed into it — a typo becomes a live user, and /login
        // becomes an open signup that bypasses the role picker entirely.
        options: { shouldCreateUser: false },
      })
      // "signups not allowed" just means no account exists. Reporting that would
      // turn this box into an account-existence oracle, so the copy and the next
      // step are identical either way; a nonexistent account simply never gets a
      // code that works.
      if (otpError && !/signup|not allowed|not found/i.test(otpError.message || '')) {
        setOtpStatus(friendlyError(otpError.message))
      } else {
        setOtpStage('code')
        setOtpStatus(NEUTRAL_CODE_SENT)
      }
    } catch {
      setOtpStatus('Unable to connect to our servers. Please try again in a few minutes.')
    }
    setOtpBusy(false)
  }

  async function verifyLoginCode() {
    const entered = otpCode.trim()
    if (!/^\d{6}$/.test(entered)) { setOtpStatus('Enter the 6-digit code from your email.'); return }

    setOtpBusy(true)
    setOtpStatus('')
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: otpEmail.trim(),
        token: entered,
        type: 'email',
      })
      // On success App's onAuthStateChange takes over and renders the dashboard.
      if (verifyError) setOtpStatus('That code is incorrect or has expired.')
    } catch {
      setOtpStatus('Unable to connect to our servers. Please try again in a few minutes.')
    }
    setOtpBusy(false)
  }

  function exitOtp() {
    setOtpStage('none')
    setOtpStatus('')
    setOtpCode('')
  }

  const otpMode = !isSignUp && otpStage !== 'none'

  // One canonical control style for the whole app (src/components/ui/Field.jsx).
  const inputStyle = controlStyle

  // Text-styled button: keyboard- and screen-reader-accessible, looks like the
  // plain centered links it replaced (mode toggle, forgot-password).
  const textButton = {
    background: 'none',
    border: 'none',
    padding: '4px',
    font: 'inherit',
    fontSize: 'var(--text-base)',
    cursor: 'pointer',
    textAlign: 'center',
    width: '100%',
    color: 'var(--color-muted)',
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
      {signedOutReason && !isSignUp && (
        <p style={{
          fontSize: 'var(--text-base)', color: 'var(--color-muted)', margin: 0, lineHeight: 1.6,
          padding: '10px 14px', borderRadius: 'var(--radius)',
          backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
        }}>
          {signedOutReason}
        </p>
      )}

      {otpMode ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {otpStage === 'email' ? (
          <>
            <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', margin: 0, lineHeight: 1.6 }}>
              We'll email you a 6-digit code. No password needed.
            </p>
            <input
              type="email"
              aria-label="Email for sign-in code"
              placeholder="Email"
              autoComplete="email"
              value={otpEmail}
              onChange={(e) => setOtpEmail(e.target.value)}
              style={inputStyle}
            />
            {otpStatus && <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-error)', margin: 0 }}>{otpStatus}</p>}
            <Button onClick={sendLoginCode} variant="primary" fullWidth loading={otpBusy}>
              Send code
            </Button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', margin: 0, lineHeight: 1.6 }}>
              {NEUTRAL_CODE_SENT} Enter it below.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Sign-in code"
              maxLength={6}
              placeholder="000000"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              style={{ ...inputStyle, letterSpacing: '0.4em', textAlign: 'center', fontSize: 'var(--text-lg)' }}
            />
            {otpStatus && otpStatus !== NEUTRAL_CODE_SENT && (
              <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-error)', margin: 0 }}>{otpStatus}</p>
            )}
            <Button onClick={verifyLoginCode} variant="primary" fullWidth loading={otpBusy}>
              Sign in
            </Button>
          </>
        )}
        <button type="button" onClick={exitOtp} style={textButton}>
          Back to sign in
        </button>
      </div>
      ) : (<>
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {isSignUp && (
        <>
          <input
            type="text"
            aria-label="Full name"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); setErrors(p => ({ ...p, fullName: '' })) }}
            style={{ ...inputStyle, borderColor: errors.fullName ? '#f87171' : 'var(--color-border)' }}
          />
          {errors.fullName && <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)', marginTop: '-8px' }}>{errors.fullName}</p>}
        </>
      )}

      <input
        type="email"
        aria-label="Email"
        placeholder="Email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '' })) }}
        style={{ ...inputStyle, borderColor: errors.email ? '#f87171' : 'var(--color-border)' }}
      />
      {errors.email && <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)', marginTop: '-8px' }}>{errors.email}</p>}
      <PasswordInput
        aria-label="Password"
        placeholder="Password"
        value={password}
        onChange={(e) => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '' })) }}
        style={{ ...inputStyle, borderColor: errors.password ? '#f87171' : 'var(--color-border)' }}
      />
      {errors.password && <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)', marginTop: '-8px' }}>{errors.password}</p>}

      {isSignUp && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)' }}>I am a...</p>
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
                  backgroundColor: role === r ? 'var(--color-primary-dim)' : 'var(--color-surface)',
                  // Selected = green border + tint; use the high-contrast text color
                  // for the label (green-on-green-dim fails WCAG AA, esp. light mode).
                  color: role === r ? 'var(--color-text)' : 'var(--color-muted)',
                  cursor: 'pointer',
                  fontWeight: role === r ? 600 : 400,
                  fontSize: 'var(--text-base)'
                }}
              >
                {r === 'solo' ? 'Individual' : 'Coach'}
              </button>
            ))}
          </div>
          {role === 'coach' && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
              You'll be able to invite and manage clients from your dashboard.
            </p>
          )}
        </div>
      )}

      {isSignUp && (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: 'var(--text-xs)', color: 'var(--color-muted)', lineHeight: 1.5, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ marginTop: '2px', flex: '0 0 auto', cursor: 'pointer', width: 16, height: 16 }}
          />
          <span>
            I confirm I'm 18 or older and agree to the{' '}
            <Link to="/terms" style={{ color: 'var(--color-primary)' }}>Terms of Service</Link>
            {' '}and{' '}
            <Link to="/privacy" style={{ color: 'var(--color-primary)' }}>Privacy Policy</Link>.
          </span>
        </label>
      )}
      {errors.agreed && <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)', marginTop: '-4px' }}>{errors.agreed}</p>}

      {error && <p style={{ color: 'var(--color-error)' }}>{error}</p>}

      <Button type="submit" variant="primary" fullWidth>
        {isSignUp ? 'Create account' : 'Sign in'}
      </Button>
      </form>

      {!isSignUp && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    {!showForgot ? (
      <button
        type="button"
        onClick={() => setShowForgot(true)}
        style={textButton}
      >
        Forgot password?
      </button>
    ) : (
      <>
        <input
          type="email"
          aria-label="Email for password reset"
          placeholder="Enter your email"
          value={forgotEmail}
          onChange={(e) => setForgotEmail(e.target.value)}
          style={inputStyle}
        />
        <Button onClick={handleForgotPassword} variant="muted" fullWidth>
          Send reset link
        </Button>
        {forgotStatus && (
          <p style={{ fontSize: 'var(--text-base)', color: forgotStatus.includes('Check') ? 'var(--color-primary)' : 'var(--color-error)', textAlign: 'center' }}>
            {forgotStatus}
          </p>
        )}
        <button
          type="button"
          onClick={() => setShowForgot(false)}
          style={textButton}
        >
          Back to sign in
        </button>
      </>
    )}
  </div>
)}
      {!isSignUp && (
        <button
          type="button"
          onClick={() => { setOtpStage('email'); setOtpEmail(email); setError('') }}
          style={textButton}
        >
          Email me a sign-in code instead
        </button>
      )}
      </>)}
      <button
        type="button"
        onClick={() => { setIsSignUp(!isSignUp); setError(''); setErrors({}) }}
        style={{ ...textButton, fontSize: 'inherit' }}
      >
        {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
      </button>
      {!isSignUp && (
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 'var(--text-xs)', color: 'var(--color-muted)', lineHeight: 1.6 }}>
          <Link to="/terms" style={{ color: 'var(--color-muted)' }}>Terms</Link>
          {' · '}
          <Link to="/privacy" style={{ color: 'var(--color-muted)' }}>Privacy</Link>
        </p>
      )}
    </div>
  )
}

export default Login
