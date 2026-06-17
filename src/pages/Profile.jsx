import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import SectionRail from '../components/SectionRail'
import Button from '../components/Button'
import PasswordInput from '../components/PasswordInput'
import SoloUpgrade from '../components/SoloUpgrade'
import SubscriptionManager from '../components/SubscriptionManager'
import CheckinBuilder from '../components/CheckinBuilder'
import ThemeToggle from '../components/ThemeToggle'
import { getPasswordValidationError } from '../utils/passwordValidation'
import { cardStyle } from '../utils/styles'
import { SOLO_BILLING_ENABLED } from '../App'
import ConfirmDialog from '../components/ConfirmDialog'
import TargetCalculator from '../components/TargetCalculator'

/* global __BUILD_TIME__ */
const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'dev'

// Coach-controlled chart visibility on the client record (keys match ClientView
// REORDERABLE_KEYS). Stored as profiles.layout.hiddenCharts; absent = all shown.
const CHART_TOGGLES = [
  { key: 'correlatedChart', label: 'Progress overview' },
  { key: 'weightChart', label: 'Weight trend' },
  { key: 'calorieChart', label: 'Calories' },
  { key: 'cardioChart', label: 'Cardio' },
  { key: 'stepsChart', label: 'Steps' },
  { key: 'measurements', label: 'Body measurements' },
]

function Profile({ session, profile, subscription, soloSubscription, onProfileUpdate }) {
  const soloSubActive =
    !!soloSubscription &&
    ['trialing', 'active', 'past_due'].includes(soloSubscription.status) &&
    !soloSubscription.paused_for_coaching
  const [name, setName] = useState(profile?.full_name || '')
  const [syncedName, setSyncedName] = useState(profile?.full_name || '')
  const [nameSaved, setNameSaved] = useState(false)
  const [nameSaving, setNameSaving] = useState(false)
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
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordStatus, setPasswordStatus] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showTargetCalc, setShowTargetCalc] = useState(false)
  const [hiddenCharts, setHiddenCharts] = useState(profile?.layout?.hiddenCharts || [])

  // Coach toggles which charts show on their clients' records (persisted to
  // profiles.layout.hiddenCharts; ClientView reads it). All shown by default.
  async function toggleChart(key) {
    const next = hiddenCharts.includes(key) ? hiddenCharts.filter(k => k !== key) : [...hiddenCharts, key]
    setHiddenCharts(next)
    const { error } = await supabase
      .from('profiles')
      .update({ layout: { ...(profile?.layout || {}), hiddenCharts: next } })
      .eq('id', session.user.id)
    if (error) { console.error('Error saving chart prefs:', error); return }
    onProfileUpdate?.()
  }
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [notice, setNotice] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeSection, setActiveSection] = useState(null) // scroll-spy: section in view

  useEffect(() => {
    async function loadTargets() {
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
    loadTargets()
  }, [session.user.id])

  // Sync the editable name when the profile (re)loads — React's "adjust state
  // during render" pattern, so we avoid a setState-in-effect.
  const profileName = profile?.full_name || ''
  if (profileName !== syncedName) {
    setSyncedName(profileName)
    setName(profileName)
  }

  // Whether the name has actually been edited (drives the Save button state).
  const nameDirty = name.trim() !== '' && name.trim() !== profileName

  async function saveName() {
    const trimmed = name.trim()
    if (!trimmed) return
    setNameSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: trimmed })
      .eq('id', session.user.id)
    setNameSaving(false)
    if (error) { console.error('Error saving name:', error); return }
    setNameSaved(true)
    setTimeout(() => setNameSaved(false), 2000)
    onProfileUpdate?.()
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
    a.download = `gardnr-export-${new Date().toISOString().split('T')[0]}.json`
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
      setNotice('Error deleting account: ' + data.error)
      setDeleteLoading(false)
    }
  }

  async function changePassword() {
    if (!newPassword) { setPasswordStatus('Enter a new password.'); return }
    if (newPassword !== confirmPassword) { setPasswordStatus('Passwords do not match.'); return }
    const passwordError = getPasswordValidationError(newPassword, { shortMessages: true })
    if (passwordError) { setPasswordStatus(passwordError); return }

    const { error } = await supabase.auth.updateUser(
      { password: newPassword },
      { currentPassword }
    )

    if (error) setPasswordStatus(error.message)
    else {
      setPasswordStatus('Password updated successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordStatus(''), 3000)
    }
  }

  const subscriptionDate = subscription?.current_period_end || subscription?.trial_end

  const inputStyle = {
    backgroundColor: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    color: 'var(--color-text)',
    fontSize: '1rem',
    width: '100%'
  }

  // --- In-page section rail (desktop) + deep-link scroll ---
  // The rail mirrors which cards actually render for this role, in order. Other
  // pages deep-link here with ?focus=<key> (e.g. ClientView → questionnaire).
  const railSections = [
    // Clients can message their coach via the app-level chat bubble; coaches and
    // solo users have no bubble on this page, so no Messages entry for them.
    { key: 'messages', label: 'Messages', show: profile?.role === 'client' },
    { key: 'account', label: 'Account', show: true },
    { key: 'appearance', label: 'Appearance', show: true },
    { key: 'targets', label: 'Daily targets', show: profile?.role !== 'coach' },
    { key: 'questionnaire', label: 'Check-in questions', show: profile?.role === 'coach' },
    { key: 'charts', label: 'Charts', show: profile?.role === 'coach' },
    { key: 'billing', label: 'Billing', show: profile?.role === 'coach' },
    { key: 'soloBilling', label: 'Solo Premium', show: profile?.role === 'solo' && (soloSubActive || SOLO_BILLING_ENABLED) },
    { key: 'security', label: 'Security', show: true },
    { key: 'data', label: 'Data', show: true },
  ].filter(s => s.show).map(({ key, label }) => ({ key, label }))

  // Smooth-scroll to a section. Profile cards aren't collapsible, so this only
  // scrolls (the retry loop covers a card whose async content hasn't mounted).
  function goToSection(key) {
    let tries = 0
    const scroll = () => {
      const el = document.getElementById('section-' + key)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      else if (tries++ < 20) setTimeout(scroll, 100)
    }
    requestAnimationFrame(() => setTimeout(scroll, 80))
  }

  // Rail clicks: "Messages" opens the client's chat bubble (it listens for
  // ?focus=chat); everything else scrolls to its section.
  function handleRailJump(key) {
    if (key === 'messages') {
      const sp = new URLSearchParams(searchParams)
      sp.set('focus', 'chat')
      setSearchParams(sp, { replace: true })
      return
    }
    goToSection(key)
  }

  // Deep-link from another page (?focus=questionnaire etc.): scroll to it once,
  // then strip the param so a refresh doesn't re-jump. 'chat' is owned by the
  // ClientChat bubble (it opens + clears the param), so leave it alone here.
  useEffect(() => {
    const focus = searchParams.get('focus')
    if (!focus || focus === 'chat') return
    goToSection(focus)
    const sp = new URLSearchParams(searchParams)
    sp.delete('focus')
    setSearchParams(sp, { replace: true })
  }, [searchParams, setSearchParams])

  // Scroll-spy: highlight the rail item for whichever section is near the top.
  // Re-runs when the rendered set changes (role/billing) so new anchors get observed.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('[id^="section-"]'))
    if (!els.length) return
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter(e => e.isIntersecting)
      if (!vis.length) return
      const top = vis.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b))
      setActiveSection(top.target.id.replace('section-', ''))
    }, { rootMargin: '-88px 0px -65% 0px', threshold: 0 })
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [profile, soloSubActive])

  return (
    <div className="page-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="cv-shell">
        <SectionRail sections={railSections} activeKey={activeSection} onJump={handleRailJump} label="Settings" />
        <div className="cv-main">
      <h1 style={{ margin: 0 }}>Profile</h1>

      <div id="section-account" style={{
        ...cardStyle,
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <h2 style={{ margin: 0 }}>Account</h2>
        <div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, marginBottom: '6px' }}>Name</p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <Button
              onClick={saveName}
              variant={nameDirty || nameSaved ? 'primary' : 'muted'}
              loading={nameSaving}
              disabled={!nameDirty}
            >
              {nameSaved ? 'Saved ✓' : 'Save'}
            </Button>
          </div>
          {profile?.role === 'client' && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: '6px 0 0' }}>
              This is the name your coach sees.
            </p>
          )}
        </div>
        <div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, marginBottom: '4px' }}>Email</p>
          <p style={{ color: 'var(--color-text)', fontSize: '1rem' }}>{session.user.email}</p>
        </div>
        <div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, marginBottom: '4px' }}>Member since</p>
          <p style={{ color: 'var(--color-text)', fontSize: '1rem' }}>
            {new Date(session.user.created_at).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric'
            })}
          </p>
        </div>
        {profile?.role && (
          <div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, marginBottom: '4px' }}>Account type</p>
            <p style={{ color: 'var(--color-text)', fontSize: '1rem', textTransform: 'capitalize' }}>
              {profile.role}
            </p>
          </div>
        )}
      </div>

      <div id="section-appearance" style={{
        ...cardStyle,
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <h2>Appearance</h2>
        <p style={{ fontSize: 'var(--text-base)', marginTop: '-6px', color: 'var(--color-muted)' }}>
          Auto follows your device's day/night setting.
        </p>
        <ThemeToggle />
      </div>

      {profile?.role !== 'coach' && (
      <div id="section-targets" style={{
        ...cardStyle,
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <h2>Daily targets</h2>
        <p style={{ fontSize: 'var(--text-base)', marginTop: '-8px' }}>
          {profile?.role === 'client'
            ? 'These targets were set by your coach.'
            : 'Set your daily goals. Leave blank to skip tracking that metric.'}
        </p>

        {/* Solo: an assessment to seed starting macros instead of guessing. */}
        {profile?.role === 'solo' && (
          <div>
            <button
              type="button"
              onClick={() => setShowTargetCalc(v => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-primary)', padding: 0 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="10" x2="8" y2="10" /><line x1="12" y1="10" x2="12" y2="10" /><line x1="16" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="8" y2="14" /><line x1="12" y1="14" x2="12" y2="14" /><line x1="16" y1="14" x2="16" y2="14" /><line x1="8" y1="18" x2="16" y2="18" />
              </svg>
              {showTargetCalc ? 'Hide calculator' : 'Calculate my targets'}
            </button>
            {showTargetCalc && (
              <div style={{ marginTop: '12px' }}>
                <TargetCalculator
                  defaultWeightUnit={targets.weight_goal_unit}
                  onApply={(t) => {
                    setTargets(prev => ({ ...prev, calories: String(t.calories), protein: String(t.protein), carbs: String(t.carbs), fat: String(t.fat) }))
                    setShowTargetCalc(false)
                  }}
                />
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          <div>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: '6px' }}>Calories</p>
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
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: '6px' }}>Protein (g)</p>
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
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: '6px' }}>Carbs (g)</p>
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
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: '6px' }}>Fat (g)</p>
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
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: '6px' }}>Cardio (min/day)</p>
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
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: '6px' }}>Steps/day</p>
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
          <p style={{ fontSize: 'var(--text-sm)', marginBottom: '6px' }}>Weight goal</p>
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

      {profile?.role === 'coach' && (
        <div id="section-questionnaire" style={{ ...cardStyle, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h2>Check-in questionnaire</h2>
          <CheckinBuilder coachId={profile.id} />
        </div>
      )}

      {profile?.role === 'coach' && (
        <div id="section-charts" style={{ ...cardStyle, padding: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h2>Charts</h2>
          <p style={{ fontSize: 'var(--text-base)', marginTop: '-8px', color: 'var(--color-muted)' }}>
            Choose which charts appear on your clients' records. All shown by default.
          </p>
          {CHART_TOGGLES.map(c => {
            const shown = !hiddenCharts.includes(c.key)
            return (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)' }}>{c.label}</span>
                <button
                  type="button"
                  onClick={() => toggleChart(c.key)}
                  aria-pressed={shown}
                  aria-label={`${c.label} chart`}
                  style={{ width: '44px', height: '24px', borderRadius: '999px', border: 'none', backgroundColor: shown ? 'var(--color-primary)' : 'var(--color-border)', cursor: 'pointer', position: 'relative', transition: 'background-color 0.2s', flexShrink: 0 }}
                >
                  <span style={{ position: 'absolute', top: '2px', left: shown ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'var(--color-on-accent)', transition: 'left 0.2s' }} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {profile?.role === 'coach' && (
        <div id="section-billing" style={{ ...cardStyle, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h2>Billing</h2>
          {subscription ? (
            <div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, marginBottom: '4px' }}>Status</p>
              <p style={{ fontSize: '1rem', fontWeight: 600, textTransform: 'capitalize', color: 'var(--color-text)', margin: 0 }}>
                {subscription.status}
              </p>
              {subscriptionDate && !subscription.cancel_at_period_end && (
                <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
                  {subscription.status === 'trialing' ? 'Trial ends' : 'Renews'}{' '}
                  {new Date(subscriptionDate).toLocaleDateString()}
                </p>
              )}
              {['trialing', 'active', 'past_due'].includes(subscription.status) && (
                <SubscriptionManager subscription={subscription} onChange={() => window.location.reload()} />
              )}
            </div>
          ) : (
            <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>No active subscription.</p>
          )}
        </div>
      )}

      {/* Solo billing is retired (Solo is free). Only show this card if the user
          still has a legacy active sub to manage, OR billing is re-enabled.
          When billing is off and there's nothing to manage, no dead paywall. */}
      {profile?.role === 'solo' && (soloSubActive || SOLO_BILLING_ENABLED) && (
        <div id="section-soloBilling" style={{ ...cardStyle, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h2>Solo Premium</h2>
          {soloSubActive ? (
            <div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, marginBottom: '4px' }}>Status</p>
              <p style={{ fontSize: '1rem', fontWeight: 600, textTransform: 'capitalize', color: 'var(--color-text)', margin: 0 }}>
                {soloSubscription.status}
              </p>
              {(soloSubscription.current_period_end || soloSubscription.trial_end) && !soloSubscription.cancel_at_period_end && (
                <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
                  {soloSubscription.status === 'trialing' ? 'Trial ends' : 'Renews'}{' '}
                  {new Date(soloSubscription.current_period_end || soloSubscription.trial_end).toLocaleDateString()}
                </p>
              )}
              {['trialing', 'active', 'past_due'].includes(soloSubscription.status) && (
                <SubscriptionManager subscription={soloSubscription} onChange={() => window.location.reload()} />
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
                Unlock advanced analytics — rolling weight average, compliance heatmap, weekend vs weekday split, best week analysis, and AI nutrition feedback.
              </p>
              <SoloUpgrade feature="Advanced analytics and AI nutrition feedback" />
            </div>
          )}
        </div>
      )}

      <div id="section-security" style={{
        ...cardStyle,
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <h2>Security</h2>
        <PasswordInput
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          style={inputStyle}
        />
        <PasswordInput
          placeholder="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          style={inputStyle}
        />
        <PasswordInput
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={inputStyle}
        />
        {passwordStatus && (
          <p style={{
            fontSize: 'var(--text-base)',
            color: passwordStatus.includes('successfully') ? 'var(--color-success)' : 'var(--color-error)'
          }}>
            {passwordStatus}
          </p>
        )}
        <Button onClick={changePassword} variant="primary">
          Update password
        </Button>
      </div>

      {/* Data */}
      <div id="section-data" style={{ ...cardStyle, padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <h2>Data</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>Export</p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: 0 }}>
            Download all your logged data — nutrition, weight, cardio, and steps — as a JSON file.
          </p>
          <div>
            <Button onClick={exportData} variant="outline" loading={exportLoading}>
              {exportLoading ? 'Exporting...' : 'Download data'}
            </Button>
          </div>
        </div>

        <div style={{ height: '1px', backgroundColor: 'var(--color-border)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-error)', margin: 0 }}>Delete account</p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: 0 }}>
            Permanently delete your account and all associated data. This cannot be undone.
          </p>
          {!showDeleteConfirm ? (
            <div>
              <Button onClick={() => setShowDeleteConfirm(true)} variant="danger">
                Delete my account
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-error)', fontWeight: 600, margin: 0 }}>
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

      <div style={{ textAlign: 'center', padding: '24px 0 8px', display: 'flex', gap: '16px', justifyContent: 'center' }}>
        <a href="/terms" style={{ color: 'var(--color-muted)', fontSize: 'var(--text-xs)', textDecoration: 'none' }}>Terms</a>
        <a href="/privacy" style={{ color: 'var(--color-muted)', fontSize: 'var(--text-xs)', textDecoration: 'none' }}>Privacy</a>
        <a href="mailto:digigardenllc@gmail.com" style={{ color: 'var(--color-muted)', fontSize: 'var(--text-xs)', textDecoration: 'none' }}>Feedback</a>
      </div>
      <p style={{ textAlign: 'center', padding: '0 0 16px', color: 'var(--color-border)', fontSize: 'var(--text-xs)' }}>
        Build {BUILD_TIME}
      </p>
        </div>
      </div>
      <ConfirmDialog
        open={notice !== null}
        message={notice}
        confirmLabel="OK"
        onConfirm={() => setNotice(null)}
      />
    </div>
  )
}

export default Profile
