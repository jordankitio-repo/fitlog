import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import Button from '../components/Button'

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)

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

  async function exportData() {
    setExportLoading(true)
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const userId = currentSession.user.id

    const [nutrition, weight, cardio, steps] = await Promise.all([
      supabase.from('nutrition_log').select('*').eq('user_id', userId).order('logged_date', { ascending: true }),
      supabase.from('weight_log').select('*').eq('user_id', userId).order('logged_date', { ascending: true }),
      supabase.from('cardio_log').select('*').eq('user_id', userId).order('logged_date', { ascending: true }),
      supabase.from('steps_log').select('*').eq('user_id', userId).order('logged_date', { ascending: true }),
    ])

    const payload = {
      exported_at: new Date().toISOString(),
      email: currentSession.user.email,
      nutrition_log: nutrition.data || [],
      weight_log: weight.data || [],
      cardio_log: cardio.data || [],
      steps_log: steps.data || [],
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fitlog-export-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setExportLoading(false)
  }

  async function deleteAccount() {
    setDeleteLoading(true)
    const { data: { session: currentSession } } = await supabase.auth.getSession()

    const response = await fetch(
      'https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/delete-account',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession.access_token}`,
        }
      }
    )

    const data = await response.json()
    if (data.success) {
      await supabase.auth.signOut()
    } else {
      alert('Error deleting account: ' + data.error)
      setDeleteLoading(false)
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
          <Button onClick={saveTargets} variant="primary">
            {saved ? 'Saved ✓' : 'Save targets'}
          </Button>
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
        <Button onClick={changePassword} variant="primary">
          Update password
        </Button>
      </div>

      {/* Data export */}
      <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h2>Export your data</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
          Download all your logged data — nutrition, weight, cardio, and steps — as a JSON file.
        </p>
        <Button onClick={exportData} variant="outline" loading={exportLoading}>
          {exportLoading ? 'Exporting...' : '⬇ Download data'}
        </Button>
      </div>

      {/* Delete account */}
      <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid #f87171', borderRadius: 'var(--radius)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h2 style={{ color: '#f87171' }}>Delete account</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
          Permanently delete your account and all associated data. This cannot be undone.
        </p>
        {!showDeleteConfirm ? (
          <Button onClick={() => setShowDeleteConfirm(true)} variant="danger">
            Delete my account
          </Button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontSize: '0.875rem', color: '#f87171', fontWeight: 600 }}>
              Are you sure? This will delete all your data permanently.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <Button onClick={deleteAccount} variant="danger-solid" loading={deleteLoading}>
                {deleteLoading ? 'Deleting...' : 'Yes, delete everything'}
              </Button>
              <Button onClick={() => setShowDeleteConfirm(false)} variant="ghost">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Profile
