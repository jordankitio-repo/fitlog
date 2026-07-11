import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import Avatar from '../components/Avatar'
import { uploadAvatar, removeAvatar, AVATAR_MAX_BYTES } from '../utils/avatarUpload'
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
import { useMediaQuery } from '../hooks/useMediaQuery'
import { ACTIVITY_LEVELS } from '../utils/targetEstimate'
import { ageFromBirthDate, cmToFtIn, ftInToCm, todayStr } from '../utils/biometrics'

// Primary-goal options (mirrors Onboarding). Stored on profiles.primary_goal.
const GOAL_OPTIONS = [
  { key: 'lose', label: 'Lose fat' },
  { key: 'gain', label: 'Build muscle' },
  { key: 'maintain', label: 'Maintain' },
  { key: 'recomp', label: 'Recomp' },
]

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
  // The mobile bottom tab bar has no sign-out (the old hamburger did), so surface
  // it here on the Profile tab; desktop keeps sign-out in the top nav.
  const isMobile = useMediaQuery('(max-width: 600px)')
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
  // Biometrics ("Your details") — solo + client only. Clients own/edit these;
  // a coach reads them (to set targets) but never writes them.
  const ftInInit = cmToFtIn(profile?.height_cm)
  const [bio, setBio] = useState({
    unit_preference: profile?.unit_preference || 'imperial',
    sex: profile?.sex || '',
    birth_date: profile?.birth_date || '',
    height_cm: profile?.height_cm != null ? String(profile.height_cm) : '',
    height_ft: ftInInit.ft,
    height_in: ftInInit.in,
    activity_level: profile?.activity_level || 'moderate',
    primary_goal: profile?.primary_goal || '',
  })
  const [bioSaved, setBioSaved] = useState(false)
  const [bioSaving, setBioSaving] = useState(false)
  // Profile picture (all roles).
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '')
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const avatarInputRef = useRef(null)
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

  // Canonical height in cm from whichever unit the user edits in.
  const bioHeightCm = bio.unit_preference === 'metric'
    ? (Number(bio.height_cm) || 0)
    : ftInToCm(bio.height_ft, bio.height_in)

  async function saveBio() {
    setBioSaving(true)
    const { error } = await supabase.from('profiles').update({
      unit_preference: bio.unit_preference,
      sex: bio.sex || null,
      birth_date: bio.birth_date || null,
      height_cm: bioHeightCm > 0 ? bioHeightCm : null,
      activity_level: bio.activity_level,
      primary_goal: bio.primary_goal || null,
    }).eq('id', session.user.id)
    setBioSaving(false)
    if (error) { console.error('Error saving details:', error); return }
    setBioSaved(true)
    setTimeout(() => setBioSaved(false), 2000)
    onProfileUpdate?.()
  }

  async function onPickAvatar(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the user re-pick the same file later
    if (!file) return
    setAvatarError('')
    if (!file.type.startsWith('image/')) { setAvatarError('Please choose an image file.'); return }
    if (file.size > AVATAR_MAX_BYTES) { setAvatarError('Image must be under 5 MB.'); return }
    setAvatarBusy(true)
    try {
      const url = await uploadAvatar(session.user.id, file)
      const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', session.user.id)
      if (error) throw error
      setAvatarUrl(url)
      onProfileUpdate?.()
    } catch (err) {
      console.error('avatar upload:', err)
      setAvatarError(err.message || 'Upload failed — try again.')
    } finally {
      setAvatarBusy(false)
    }
  }

  async function onRemoveAvatar() {
    setAvatarBusy(true)
    setAvatarError('')
    try {
      await removeAvatar(session.user.id)
      const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', session.user.id)
      if (error) throw error
      setAvatarUrl('')
      onProfileUpdate?.()
    } catch (err) {
      console.error('avatar remove:', err)
      setAvatarError('Could not remove — try again.')
    } finally {
      setAvatarBusy(false)
    }
  }

  async function exportData() {
    setExportLoading(true)
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const userId = currentSession.user.id

    // Complete personal-data export (data-portability right). Covers every table
    // that holds the user's own data — keep in sync with the delete-account erasure
    // list. RLS still scopes each query to the caller's rows.
    const [
      profile, targets, nutrition, weight, cardio, steps, measurements,
      savedMeals, savedMealItems, dayComplete, checkIns, messages, notifications,
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('targets').select('*').eq('user_id', userId),
      supabase.from('nutrition_log').select('*').eq('user_id', userId).order('logged_date', { ascending: true }),
      supabase.from('weight_log').select('*').eq('user_id', userId).order('logged_date', { ascending: true }),
      supabase.from('cardio_log').select('*').eq('user_id', userId).order('logged_date', { ascending: true }),
      supabase.from('steps_log').select('*').eq('user_id', userId).order('logged_date', { ascending: true }),
      supabase.from('body_measurements').select('*').eq('user_id', userId).order('logged_date', { ascending: true }),
      supabase.from('saved_meals').select('*').eq('user_id', userId),
      supabase.from('saved_meal_items').select('*').eq('user_id', userId),
      supabase.from('day_complete').select('*').eq('user_id', userId),
      supabase.from('check_ins').select('*').eq('client_id', userId).order('created_at', { ascending: true }),
      supabase.from('messages').select('*').or(`coach_id.eq.${userId},client_id.eq.${userId}`).order('created_at', { ascending: true }),
      supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    ])

    const payload = {
      exported_at: new Date().toISOString(),
      account: { id: userId, email: currentSession.user.email },
      profile: profile.data || null,
      targets: targets.data || [],
      nutrition_log: nutrition.data || [],
      weight_log: weight.data || [],
      cardio_log: cardio.data || [],
      steps_log: steps.data || [],
      body_measurements: measurements.data || [],
      saved_meals: savedMeals.data || [],
      saved_meal_items: savedMealItems.data || [],
      day_complete: dayComplete.data || [],
      check_ins: checkIns.data || [],
      messages: messages.data || [],
      notifications: notifications.data || [],
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
    { key: 'details', label: 'Your details', show: profile?.role !== 'coach' },
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
        <SectionRail sections={railSections} activeKey={activeSection} onJump={handleRailJump} label="Profile" />
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Avatar url={avatarUrl} name={profile?.full_name || ''} size={64} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input ref={avatarInputRef} type="file" accept="image/*" onChange={onPickAvatar} style={{ display: 'none' }} />
              <Button onClick={() => avatarInputRef.current?.click()} variant="outline" size="sm" loading={avatarBusy}>
                {avatarUrl ? 'Change photo' : 'Upload photo'}
              </Button>
              {avatarUrl && <Button onClick={onRemoveAvatar} variant="ghost" size="sm" disabled={avatarBusy}>Remove</Button>}
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: avatarError ? 'var(--color-error)' : 'var(--color-muted)', margin: 0 }}>
              {avatarError || 'JPG or PNG, up to 5 MB.'}
            </p>
          </div>
        </div>

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

      {profile?.role !== 'coach' && (() => {
        const metric = bio.unit_preference === 'metric'
        const age = ageFromBirthDate(bio.birth_date)
        const pill = (active) => ({
          flex: 1, padding: '9px', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 'var(--text-sm)', fontWeight: active ? 600 : 500,
          border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
          background: active ? 'var(--color-primary-dim)' : 'var(--color-surface)',
          color: active ? 'var(--color-primary)' : 'var(--color-muted)',
        })
        const lbl = { fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: '6px', display: 'block' }
        return (
          <div id="section-details" style={{ ...cardStyle, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h2 style={{ margin: 0 }}>Your details</h2>
              <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', margin: '6px 0 0' }}>
                Used to estimate your targets.{profile?.role === 'client' ? ' Your coach can see these to fine-tune your plan.' : ''}
              </p>
            </div>

            <div>
              <label style={lbl}>Units</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[['imperial', 'lb / ft·in'], ['metric', 'kg / cm']].map(([u, t]) => (
                  <button key={u} type="button" onClick={() => setBio({ ...bio, unit_preference: u })} style={pill(bio.unit_preference === u)}>{t}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={lbl}>Sex</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[['male', 'Male'], ['female', 'Female']].map(([v, t]) => (
                    <button key={v} type="button" onClick={() => setBio({ ...bio, sex: v })} style={pill(bio.sex === v)}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={lbl}>Date of birth{age != null ? ` · ${age} yrs` : ''}</label>
                <input type="date" className="dob-field" value={bio.birth_date} max={todayStr()} onChange={(e) => setBio({ ...bio, birth_date: e.target.value })} style={{ ...pill(false), color: 'var(--color-text)', width: '100%', textAlign: 'center', height: '36px' }} />
              </div>
            </div>

            <div>
              <label style={lbl}>Height</label>
              {metric ? (
                <input type="number" inputMode="numeric" value={bio.height_cm} onChange={(e) => setBio({ ...bio, height_cm: e.target.value })} placeholder="cm" style={inputStyle} />
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="number" inputMode="numeric" value={bio.height_ft} onChange={(e) => setBio({ ...bio, height_ft: e.target.value })} placeholder="ft" style={inputStyle} />
                  <input type="number" inputMode="numeric" value={bio.height_in} onChange={(e) => setBio({ ...bio, height_in: e.target.value })} placeholder="in" style={inputStyle} />
                </div>
              )}
            </div>

            <div>
              <label style={lbl}>Activity level</label>
              <select value={bio.activity_level} onChange={(e) => setBio({ ...bio, activity_level: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                {ACTIVITY_LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
              </select>
            </div>

            <div>
              <label style={lbl}>Primary goal</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                {GOAL_OPTIONS.map((g) => (
                  <button key={g.key} type="button" onClick={() => setBio({ ...bio, primary_goal: g.key })} style={pill(bio.primary_goal === g.key)}>{g.label}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Button onClick={saveBio} variant="primary" loading={bioSaving}>Save details</Button>
              {bioSaved && <span style={{ color: 'var(--color-primary)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>Saved ✓</span>}
            </div>
          </div>
        )
      })()}

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
                  initial={{
                    sex: bio.sex || undefined,
                    age: ageFromBirthDate(bio.birth_date) ?? undefined,
                    heightCm: bioHeightCm || undefined,
                    units: bio.unit_preference,
                    goalWeight: targets.weight_goal || undefined,
                    activity: bio.activity_level,
                  }}
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

      {isMobile && (
        <div style={{ padding: '20px 0 0' }}>
          <Button onClick={() => supabase.auth.signOut()} variant="muted" fullWidth>
            Sign out
          </Button>
        </div>
      )}

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
