import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import PasswordInput from '../components/PasswordInput'
import { getPasswordValidationError } from '../utils/passwordValidation'
import { controlStyle } from '../components/ui'

function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Supabase handles the token from the URL automatically
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User is now in password recovery mode
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleReset() {
    if (!password) { setError('Enter a new password.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    const passwordError = getPasswordValidationError(password)
    if (passwordError) { setError(passwordError); return }

    setLoading(true)
    setError('')

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
    } else {
      await supabase.auth.signOut()
      navigate('/login')
    }
    setLoading(false)
  }

  // One canonical control style for the whole app (src/components/ui/Field.jsx).
  const inputStyle = controlStyle

  return (
    <div style={{
      maxWidth: '400px',
      margin: '80px auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      <h1>Reset password</h1>
      <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-base)' }}>
        Enter your new password below.
      </p>

      <PasswordInput
        placeholder="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={inputStyle}
      />
      <PasswordInput
        placeholder="Confirm new password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        style={inputStyle}
      />

      {error && <p style={{ color: 'var(--color-error)' }}>{error}</p>}

      <button onClick={handleReset} disabled={loading} style={{
        backgroundColor: 'var(--color-primary)',
        color: 'var(--color-on-accent)',
        border: 'none',
        borderRadius: '8px',
        padding: '10px 20px',
        cursor: loading ? 'not-allowed' : 'pointer',
        fontWeight: 600,
        opacity: loading ? 0.7 : 1
      }}>
        {loading ? 'Updating...' : 'Update password'}
      </button>
    </div>
  )
}

export default ResetPassword