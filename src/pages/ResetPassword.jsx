import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

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
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }

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
      <h1>Reset password</h1>
      <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>
        Enter your new password below.
      </p>

      <input
        type="password"
        placeholder="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={inputStyle}
      />
      <input
        type="password"
        placeholder="Confirm new password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        style={inputStyle}
      />

      {error && <p style={{ color: '#f87171' }}>{error}</p>}

      <button onClick={handleReset} disabled={loading} style={{
        backgroundColor: '#4f8ef7',
        color: '#fff',
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