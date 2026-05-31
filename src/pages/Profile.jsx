import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

function Profile({ session, profile }) {
  const [targets, setTargets] = useState({
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    cardio_minutes: '',
    steps: '',
    weight_goal: '',
    weight_goal_unit: 'lbs'
  })
  const [saved, setSaved] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordStatus, setPasswordStatus] = useState('')

  useEffect(() => {
    fetchTargets()
  }, [])

  async function fetchTargets() {
    const { data, error } = await supabase
      .from('targets')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (error) console.error('Error fetching targets:', error)
    else if (data) {
      setTargets({
        calories: data.calories?.toString() || '',
        protein: data.protein?.toString() || '',
        carbs: data.carbs?.toString() || '',
        fat: data.fat?.toString() || '',
        cardio_minutes: data.cardio_minutes?.toString() || '',
        steps: data.steps?.toString() || '',
        weight_goal: data.weight_goal?.toString() || '',
        weight_goal_unit: data.weight_goal_unit || 'lbs'
      })
    }
  }

  async function saveTargets() {
    const payload = {
      user_id: session.user.id,
      calories: parseInt(targets.calories) || null,
      protein: parseInt(targets.protein) || null,
      carbs: parseInt(targets.carbs) || null,
      fat: parseInt(targets.fat) || null,
      weight_goal: parseFloat(targets.weight_goal) || null,
      cardio_minutes: parseInt(targets.cardio_minutes) || null,
      steps: parseInt(targets.steps) || null,
      weight_goal_unit: targets.weight_goal_unit,
      updated_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from('targets')
      .upsert(payload, { onConflict: 'user_id' })

    if (error) console.error('Error saving targets:', error)
    else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  async function changePassword() {
    if (!newPassword) { setPasswordStatus('Enter a new password.'); return }
    if (newPassword.length < 6) { setPasswordStatus('Password must be at least 6 characters.'); return }
    if (newPassword !== confirmPassword) { setPasswordStatus('Passwords do not match.'); return }

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) setPasswordStatus(error.message)
    else {
      setPasswordStatus('Password updated successfully.')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordStatus(''), 3000)
    }
  }

  const inputStyle = {
    backgroundColor: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    color: 'var(--color-text)',
    fontSize: '1rem',
    width: '100%'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h1>Profile</h1>

      <div style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div>
          <p style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Email</p>
          <p style={{ color: 'var(--color-text)', fontSize: '1rem' }}>{session.user.email}</p>
        </div>
        <div>
          <p style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Member since</p>
          <p style={{ color: 'var(--color-text)', fontSize: '1rem' }}>
            {new Date(session.user.created_at).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric'
            })}
          </p>
        </div>
        {profile?.role && (
          <div>
            <p style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Account type</p>
            <p style={{ color: 'var(--color-text)', fontSize: '1rem', textTransform: 'capitalize' }}>
              {profile.role}
            </p>
          </div>
        )}
      </div>

      {profile?.role !== 'coach' && (
      <div style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <h2>Daily targets</h2>
        <p style={{ fontSize: '0.875rem', marginTop: '-8px' }}>
          {profile?.role === 'client'
            ? 'These targets were set by your coach.'
            : 'Set your daily goals. Leave blank to skip tracking that metric.'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          <div>
            <p style={{ fontSize: '0.75rem', marginBottom: '6px' }}>Calories</p>
            <input
              type="number"
              placeholder="e.g. 2000"
              value={targets.calories}
              onChange={(e) => setTargets({ ...targets, calories: e.target.value })}
              readOnly={profile?.role === 'client'}
              style={{ ...inputStyle, cursor: profile?.role === 'client' ? 'default' : 'text', opacity: profile?.role === 'client' ? 0.7 : 1 }}
            />
          </div>
          <div>
            <p style={{ fontSize: '0.75rem', marginBottom: '6px' }}>Protein (g)</p>
            <input
              type="number"
              placeholder="e.g. 150"
              value={targets.protein}
              onChange={(e) => setTargets({ ...targets, protein: e.target.value })}
              readOnly={profile?.role === 'client'}
              style={{ ...inputStyle, cursor: profile?.role === 'client' ? 'default' : 'text', opacity: profile?.role === 'client' ? 0.7 : 1 }}
            />
          </div>
          <div>
            <p style={{ fontSize: '0.75rem', marginBottom: '6px' }}>Carbs (g)</p>
            <input
              type="number"
              placeholder="e.g. 200"
              value={targets.carbs}
              onChange={(e) => setTargets({ ...targets, carbs: e.target.value })}
              readOnly={profile?.role === 'client'}
              style={{ ...inputStyle, cursor: profile?.role === 'client' ? 'default' : 'text', opacity: profile?.role === 'client' ? 0.7 : 1 }}
            />
          </div>
          <div>
            <p style={{ fontSize: '0.75rem', marginBottom: '6px' }}>Fat (g)</p>
            <input
              type="number"
              placeholder="e.g. 65"
              value={targets.fat}
              onChange={(e) => setTargets({ ...targets, fat: e.target.value })}
              readOnly={profile?.role === 'client'}
              style={{ ...inputStyle, cursor: profile?.role === 'client' ? 'default' : 'text', opacity: profile?.role === 'client' ? 0.7 : 1 }}
            />
          </div>
          <div>
            <p style={{ fontSize: '0.75rem', marginBottom: '6px' }}>Cardio (min/day)</p>
            <input
              type="number"
              placeholder="e.g. 30"
              value={targets.cardio_minutes || ''}
              onChange={(e) => setTargets({ ...targets, cardio_minutes: e.target.value })}
              readOnly={profile?.role === 'client'}
              style={{ ...inputStyle, cursor: profile?.role === 'client' ? 'default' : 'text', opacity: profile?.role === 'client' ? 0.7 : 1 }}
            />
          </div>
          <div>
            <p style={{ fontSize: '0.75rem', marginBottom: '6px' }}>Steps/day</p>
            <input
              type="number"
              placeholder="e.g. 10000"
              value={targets.steps || ''}
              onChange={(e) => setTargets({ ...targets, steps: e.target.value })}
              readOnly={profile?.role === 'client'}
              style={{ ...inputStyle, cursor: profile?.role === 'client' ? 'default' : 'text', opacity: profile?.role === 'client' ? 0.7 : 1 }}
            />
          </div>
        </div>

        <div>
          <p style={{ fontSize: '0.75rem', marginBottom: '6px' }}>Weight goal</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="number"
              placeholder="e.g. 175"
              value={targets.weight_goal}
              onChange={(e) => setTargets({ ...targets, weight_goal: e.target.value })}
              readOnly={profile?.role === 'client'}
              style={{ ...inputStyle, flex: 1, cursor: profile?.role === 'client' ? 'default' : 'text', opacity: profile?.role === 'client' ? 0.7 : 1 }}
            />
            <select
              value={targets.weight_goal_unit}
              onChange={(e) => setTargets({ ...targets, weight_goal_unit: e.target.value })}
              disabled={profile?.role === 'client'}
              style={{ ...inputStyle, width: '80px', cursor: profile?.role === 'client' ? 'default' : 'pointer', opacity: profile?.role === 'client' ? 0.7 : 1 }}
            >
              <option value="lbs">lbs</option>
              <option value="kg">kg</option>
            </select>
          </div>
        </div>

        {profile?.role !== 'client' && (
          <button onClick={saveTargets} style={{
            backgroundColor: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius)',
            padding: '10px 20px',
            cursor: 'pointer',
            fontWeight: 600,
            width: 'fit-content'
          }}>
            {saved ? 'Saved ✓' : 'Save targets'}
          </button>
        )}
      </div>
      )}

      <div style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <h2>Change password</h2>
        <input
          type="password"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={inputStyle}
        />
        {passwordStatus && (
          <p style={{
            fontSize: '0.875rem',
            color: passwordStatus.includes('successfully') ? '#34d399' : '#f87171'
          }}>
            {passwordStatus}
          </p>
        )}
        <button onClick={changePassword} style={{
          backgroundColor: 'var(--color-primary)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--radius)',
          padding: '10px 20px',
          cursor: 'pointer',
          fontWeight: 600,
          width: 'fit-content'
        }}>
          Update password
        </button>
      </div>
    </div>
  )
}

export default Profile
