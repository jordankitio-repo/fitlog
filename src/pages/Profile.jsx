import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import Avatar from '../components/Avatar'
import { uploadAvatar, removeAvatar, AVATAR_MAX_BYTES } from '../utils/avatarUpload'
import SectionRail from '../components/SectionRail'
import Button from '../components/Button'
import PasswordInput from '../components/PasswordInput'
import SoloUpgrade from '../components/SoloUpgrade'
import SubscriptionManager from '../components/SubscriptionManager'
import CheckinBuilder from '../components/CheckinBuilder'
import AppearanceControls from '../components/AppearanceControls'
import { getPasswordValidationError } from '../utils/passwordValidation'
import { SOLO_BILLING_ENABLED } from '../App'
import { hidesPaymentUI, isNativeApp } from '../utils/platform'
import { fetchAppleHealthConnection } from '../utils/healthSync'
import AppleHealthSettings from '../components/AppleHealthSettings'
import { SECTION_ICONS } from '../utils/sectionIcons'
import ConfirmDialog from '../components/ConfirmDialog'
import TargetCalculator from '../components/TargetCalculator'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { ACTIVITY_LEVELS } from '../utils/targetEstimate'
import { ageFromBirthDate, cmToFtIn, ftInToCm, todayStr } from '../utils/biometrics'
import { convertGoalValue } from '../utils/weightTarget'
import { controlStyle, Icon, Panel, Pill, SettingRow, Toggle } from '../components/ui'
import { GOALS, goalLabel } from '../utils/goals'
import { categoriesForRole, isEnabled } from '../utils/notificationCategories'

/* global __BUILD_TIME__ */
const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'dev'

// Stripe's status strings are machine names, and this card used to render them
// through `textTransform: capitalize` — which turns `past_due` into "Past_due",
// on the one status a coach is most likely to be reading, at the moment they are
// least inclined to be charitable about it. The capitalize is gone with it: it
// also title-cased everything it touched ("Free Trial"), and a map that returns
// display-ready text has no use for a second opinion. An unmapped status falls
// through as its raw name, which is a visible prompt to add it here.
const STATUS_LABEL = {
  trialing: 'Free trial',
  active: 'Active',
  past_due: 'Past due',
  canceled: 'Canceled',
  incomplete: 'Incomplete',
}

// What the date on a subscription row MEANS depends on its status, and only
// three statuses have an honest sentence for it. The card used to print
// "Renews <date>" for everything that was not `trialing`, which put "Renews 6
// Nov" under "Canceled" and directly above a past-due payment notice — the date
// is real, the verb is a lie, and nothing about either line looks wrong on its
// own. An allow-list rather than a list of exceptions, so a status nobody
// thought about renders no line instead of inheriting the wrong one.
const DATE_LABEL = {
  active: 'Renews',
  trialing: 'Trial ends',
  canceled: 'Ended',
}

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

// The phone's way back out of a section. Type-only, and it travels the same
// --color-faint -> --color-text-dim -> --color-text progression every other
// type-only control in the app uses (D2).
const backLinkStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-4)',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  color: 'var(--color-faint)',
  fontSize: 'var(--text-sm)',
  alignSelf: 'flex-start',
}

// A settings section. Renders nothing unless it is the one the route is on.
//
// Declared at module scope on purpose. Defined inside Profile() it would be a
// brand-new component type on every render, so React would unmount and remount
// the entire subtree each time — every field on this page losing its value and
// its focus on each keystroke. That bug is invisible in a diff and obvious the
// first time someone types their name.
function SectionPanel({ active, hideTitle, title, children, ...rest }) {
  if (!active) return null
  // On a phone the section IS the page, so the h1 above already names it and
  // the panel's own header would say it a second time, three lines below the
  // first — on the screen with the least room to spare. On a desktop the h1 is
  // the page ("Profile") and the panel header is the section, so both earn
  // their place.
  return <Panel title={hideTitle ? undefined : title} {...rest}>{children}</Panel>
}

function Profile({ session, profile, subscription, soloSubscription, onProfileUpdate }) {
  // The mobile bottom tab bar has no sign-out (the old hamburger did), so surface
  // it here on the Profile tab; desktop keeps sign-out in the top nav.
  const isMobile = useMediaQuery('(max-width: 600px)')
  const soloSubActive =
    !!soloSubscription &&
    ['trialing', 'active', 'past_due'].includes(soloSubscription.status) &&
    !soloSubscription.paused_for_coaching

  // The Solo Premium card is wholly payment UI: SoloUpgrade opens a Stripe
  // checkout, SubscriptionManager opens the billing portal. It is also the ONLY
  // purchase path a non-coach can reach, so it is the one the coach-role gate
  // in App.jsx does not already close, and the only reason this check exists
  // here at all.
  //
  // One const for both the rail entry and the panel, so the rule cannot end up
  // with a copy in each that drift.
  const showSoloBilling =
    profile?.role === 'solo' && (soloSubActive || SOLO_BILLING_ENABLED) && !hidesPaymentUI()
  // Apple Health. `undefined` until read, so the rail entry does not flicker
  // in on the web for someone who turns out to have a connection.
  const [healthConnection, setHealthConnection] = useState(undefined)
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
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordStatus, setPasswordStatus] = useState('')
  // Password changes go through GoTrue's own reauthentication nonce, so a live
  // session alone can't set a new password. 'form' -> enter it, 'code' -> prove
  // it's you with the emailed code.
  const [pwStage, setPwStage] = useState('form')
  const [pwCode, setPwCode] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [globalSignOutBusy, setGlobalSignOutBusy] = useState(false)
  // 'idle' -> 'confirm' (are you sure) -> 'code' (emailed confirmation).
  const [deleteStage, setDeleteStage] = useState('idle')
  const [deleteCode, setDeleteCode] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [codeSending, setCodeSending] = useState(false)
  const [showTargetCalc, setShowTargetCalc] = useState(false)
  const [hiddenCharts, setHiddenCharts] = useState(profile?.layout?.hiddenCharts || [])
  // Email notification preferences. Absent key = send, so an untouched account
  // has no row at all and every toggle reads as on.
  const emailCategories = categoriesForRole(profile?.role)
  const [emailPrefs, setEmailPrefs] = useState(null)

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
  // Optimistic, like toggleChart above: the control answers the tap and the
  // write follows. A failed write reverts, because a toggle that stays switched
  // while the server disagrees is the one failure a preferences screen must not
  // have — the user would believe they had opted out.
  async function toggleEmailCategory(key) {
    const current = emailPrefs || {}
    const next = { ...current, [key]: !isEnabled(current, key) }
    setEmailPrefs(next)
    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: session.user.id, email: next, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' })
    if (error) {
      console.error('Error saving notification preferences:', error)
      setEmailPrefs(current)
    }
  }

  const [deleteLoading, setDeleteLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [notice, setNotice] = useState(null)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { section: routeSection } = useParams()

  const reloadHealthConnection = () => fetchAppleHealthConnection(session.user.id)
    .then(setHealthConnection)
    .catch(err => {
      console.error('Error fetching Apple Health connection:', err)
      setHealthConnection(null)
    })
  useEffect(() => {
    if (profile?.role === 'coach') return
    fetchAppleHealthConnection(session.user.id)
      .then(setHealthConnection)
      .catch(err => {
        console.error('Error fetching Apple Health connection:', err)
        setHealthConnection(null)
      })
  }, [session.user.id, profile?.role])

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

  useEffect(() => {
    // maybeSingle, not single: "no row" is the normal state for anyone who has
    // never changed a preference, and it means every category is on.
    async function loadEmailPrefs() {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('email')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (error) console.error('Error fetching notification preferences:', error)
      setEmailPrefs(data?.email || {})
    }
    loadEmailPrefs()
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
      // primary_goal is coach-owned for a client, so it is deliberately absent
      // from their update: leaving it in would let a stale local value overwrite
      // what the coach just set, every time the client saved anything else.
      ...(profile?.role === 'client' ? {} : { primary_goal: bio.primary_goal || null }),
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
      setAvatarError(err.message || 'Upload failed. Try again.')
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
      setAvatarError('Could not remove. Try again.')
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
    // Note on device sync: `device_connections` is exported because it is the
    // user's own record of what they connected, and the metric rows above now
    // carry `source` so the export shows where each number came from. Nothing
    // credential-bearing is exported — the connection row holds no tokens by
    // design, and `device_dismissals` is internal bookkeeping, not user data.
    const [
      profile, targets, nutrition, weight, cardio, steps, measurements,
      savedMeals, savedMealItems, dayComplete, checkIns, messages, notifications,
      deviceConnections, deviceMetricSources, healthConsents,
      emailPreferences,
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
      supabase.from('device_connections').select('*').eq('user_id', userId).order('connected_at', { ascending: true }),
      supabase.from('device_metric_preferences').select('*').eq('user_id', userId),
      supabase.from('health_data_consents').select('*').eq('user_id', userId).order('granted_at', { ascending: true }),
      supabase.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle(),
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
      device_connections: deviceConnections.data || [],
      device_metric_preferences: deviceMetricSources.data || [],
      health_data_consents: healthConsents.data || [],
      notification_preferences: emailPreferences.data || null,
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

  // Ask the server to email a one-time code before an irreversible action.
  async function requestDeleteCode() {
    setCodeSending(true)
    setDeleteError('')
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/request-step-up`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentSession.access_token}`,
          },
          body: JSON.stringify({ purpose: 'delete_account' }),
        },
      )
      const data = await response.json()
      if (data.sent) setDeleteStage('code')
      else setDeleteError(data.error || 'Could not send a code. Please try again.')
    } catch {
      setDeleteError('Unable to connect to our servers. Please try again in a few minutes.')
    }
    setCodeSending(false)
  }

  async function deleteAccount() {
    if (!/^\d{6}$/.test(deleteCode.trim())) {
      setDeleteError('Enter the 6-digit code from your email.')
      return
    }
    setDeleteLoading(true)
    setDeleteError('')
    const { data: { session: currentSession } } = await supabase.auth.getSession()

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession.access_token}`,
        },
        // The server verifies this and refuses without it — the code is not a
        // client-side speed bump.
        body: JSON.stringify({ stepUpCode: deleteCode.trim() }),
      }
    )

    const data = await response.json()
    if (data.success) {
      await supabase.auth.signOut()
    } else {
      setDeleteError(data.error || 'Could not delete your account.')
      setDeleteLoading(false)
    }
  }

  // Step 1: validate the new password, then have GoTrue email a nonce.
  async function startPasswordChange() {
    if (!newPassword) { setPasswordStatus('Enter a new password.'); return }
    if (newPassword !== confirmPassword) { setPasswordStatus('Passwords do not match.'); return }
    const passwordError = getPasswordValidationError(newPassword, { shortMessages: true })
    if (passwordError) { setPasswordStatus(passwordError); return }

    setPwBusy(true)
    setPasswordStatus('')
    const { error } = await supabase.auth.reauthenticate()
    if (error) setPasswordStatus(error.message)
    else {
      setPwStage('code')
      setPasswordStatus('We emailed you a 6-digit code. Enter it to confirm.')
    }
    setPwBusy(false)
  }

  // Step 2: the nonce is what actually authorises the change. The old code
  // passed `{ currentPassword }` here, which supabase-js does not support and
  // silently ignored — so the "current password" box never checked anything,
  // and a passwordless client had no way to set one at all.
  async function confirmPasswordChange() {
    if (!/^\d{6}$/.test(pwCode.trim())) {
      setPasswordStatus('Enter the 6-digit code from your email.')
      return
    }
    setPwBusy(true)
    const { error } = await supabase.auth.updateUser(
      { password: newPassword },
      { nonce: pwCode.trim() },
    )
    if (error) setPasswordStatus(error.message)
    else {
      setPasswordStatus('Password updated successfully.')
      setNewPassword('')
      setConfirmPassword('')
      setPwCode('')
      setPwStage('form')
      setTimeout(() => setPasswordStatus(''), 3000)
    }
    setPwBusy(false)
  }

  // Ends every session on every device, not just this browser — the control
  // people actually want when a phone goes missing.
  async function signOutEverywhere() {
    setGlobalSignOutBusy(true)
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) {
      setNotice('Could not sign out everywhere: ' + error.message)
      setGlobalSignOutBusy(false)
    }
  }

  // Switching units CONVERTS the height already entered rather than just
  // relabelling the fields. The toggle used to set `unit_preference` and
  // nothing else, so a person who had entered 5'11" and switched to metric saw
  // an empty centimetres box and had to measure themselves again — or worse,
  // retyped 511. Height changes SHAPE between the systems (two fields or one),
  // so this converts between forms rather than scaling a number.
  //
  // Weight is not here: the only weight on this page is the goal in Daily
  // targets, which carries its own unit and its own converter.
  function changeBioUnits(next) {
    if (next === bio.unit_preference) return
    if (next === 'metric') {
      const cm = ftInToCm(bio.height_ft, bio.height_in)
      setBio({ ...bio, unit_preference: next, height_cm: cm ? String(cm) : '' })
    } else {
      const { ft, in: inches } = cmToFtIn(bio.height_cm)
      setBio({ ...bio, unit_preference: next, height_ft: ft, height_in: inches })
    }
  }

  const subscriptionDate = subscription?.current_period_end || subscription?.trial_end
  // Paused is a date in the future, matching SubscriptionManager's reading of
  // the same column.
  const isPaused = Boolean(subscription?.paused_until)
    && new Date(subscription.paused_until) > new Date()

  // One canonical control style for the whole app (src/components/ui/Field.jsx).
  const inputStyle = controlStyle

  // --- The settings rail: three groups, each entry its own route ---
  //
  // GROUPED, because a flat column of eleven makes the reader scan all eleven
  // to find one. The split answers "what is this about?": YOU is how the app
  // behaves for you, COACHING is how you work with the people in it, ACCOUNT
  // is the relationship with Gardnr itself. A coach sees three in the middle
  // group and a client sees two; the group vanishes when it is empty, so no
  // role is shown a heading with nothing under it.
  const railGroups = [
    {
      label: 'You',
      items: [
        // No Messages entry. It was a rail row that only ever navigated to
        // /coach, and /coach is already in the primary nav for a client on
        // both the phone's tab bar and the desktop pill links. So it was a
        // second route to a destination one tap away, inside Settings, which
        // is the "what did my coach say?" question having two answers again --
        // the exact thing deleting ChatBubble was meant to end.
        { key: 'account', label: 'Account', show: true },
        { key: 'appearance', label: 'Appearance', show: true },
        { key: 'notifications', label: 'Notifications', show: emailCategories.length > 0 },
        // Connecting is phone-only (Health lives on the phone); a web visitor
        // sees the entry only to manage a connection that already exists.
        { key: 'health', label: 'Apple Health', show: profile?.role !== 'coach' && (isNativeApp() || Boolean(healthConnection)) },
      ],
    },
    {
      label: 'Coaching',
      items: [
        { key: 'details', label: 'Your details', show: profile?.role !== 'coach' },
        { key: 'targets', label: 'Daily targets', show: profile?.role !== 'coach' },
        { key: 'questionnaire', label: 'Check-in questions', show: profile?.role === 'coach' },
        { key: 'charts', label: 'Charts', show: profile?.role === 'coach' },
      ],
    },
    {
      label: 'Account',
      items: [
        { key: 'billing', label: 'Billing', show: profile?.role === 'coach' },
        { key: 'soloBilling', label: 'Solo Premium', show: showSoloBilling },
        { key: 'security', label: 'Security', show: true },
        { key: 'data', label: 'Data', show: true },
      ],
    },
  ]
    .map(g => ({ ...g, items: g.items.filter(i => i.show).map(({ key, label }) => ({ key, label })) }))
    .filter(g => g.items.length)

  // Every destination this role actually has, flat, in rail order. One source:
  // the rail, the route validator and the phone's list all read it, so a
  // section cannot be reachable from one and missing from another.
  const destinations = railGroups.flatMap(g => g.items)

  // The section this route is on. An unknown or absent one falls back to the
  // first destination on a desktop (the rail is on screen, so landing
  // somewhere real beats landing nowhere) and to null on a phone, where null
  // IS a screen: the list of destinations.
  const requestedSection = destinations.some(d => d.key === routeSection) ? routeSection : null
  const activeSection = requestedSection ?? (isMobile ? null : destinations[0]?.key ?? null)

  // One switch, like ClientView's. The sections stay inline exactly where they
  // are and hiding costs one token each, rather than eleven files or eleven
  // brace-matched wrappers.
  const isVisible = (key) => key === activeSection

  // The rail navigates. It used to scroll a 3,400px page, which is why the
  // page was 3,400px: everything had to be mounted for the scroll to have
  // somewhere to land. A settings page is visited to change ONE thing, so the
  // section is a route and the screen is only ever as long as the thing you
  // came for.
  function handleRailJump(key) {
    navigate(`/profile/${key}`)
  }

  // `?focus=<key>` is a PERMANENT entry point, not a legacy one to migrate off.
  // It is baked into URLs that live outside this codebase and cannot be
  // changed after the fact: Stripe's billing-portal return URL, and the
  // payment-failed email, both of which point at /profile?focus=billing. Every
  // one of those must keep landing on the right section for as long as the
  // mail exists.
  //
  // It redirects to the route and replaces the history entry, so the back
  // button goes where the reader came from rather than back to a redirect.
  // 'chat' is skipped because it names no section here — it belonged to the
  // retired ChatBubble — and a hand-typed one must not be treated as a section.
  useEffect(() => {
    const focus = searchParams.get('focus')
    if (!focus || focus === 'chat') return
    const sp = new URLSearchParams(searchParams)
    sp.delete('focus')
    const query = sp.toString()
    const known = focus === 'messages' || destinations.some(d => d.key === focus)
    navigate(
      known && focus !== 'messages'
        ? `/profile/${focus}${query ? `?${query}` : ''}`
        : focus === 'messages' ? '/coach' : `/profile${query ? `?${query}` : ''}`,
      { replace: true },
    )
  }, [searchParams, navigate, destinations])

  // Scroll-spy: highlight the rail item for whichever section is near the top.
  // Re-runs when the rendered set changes (role/billing) so new anchors get observed.
  // The scroll-spy that used to live here is gone with the scrolling. The
  // route says which section is active, so there is nothing to observe and no
  // second opinion about it.

  return (
    <div className="page-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="cv-shell">
        <SectionRail groups={railGroups} activeKey={activeSection} onJump={handleRailJump} />
        <div className="cv-main">
      {/* C5: a back link names its destination. On a phone a section IS the
          page, so the way out has to be on it — there is no rail to return to. */}
      {isMobile && activeSection && (
        <button type="button" onClick={() => navigate('/profile')} className="ds-control" style={backLinkStyle}>
          <Icon name="left" size={16} /> Profile
        </button>
      )}

      <h1 style={{ margin: 0 }}>
        {isMobile && activeSection
          ? destinations.find(d => d.key === activeSection)?.label ?? 'Profile'
          : 'Profile'}
      </h1>

      {/* The phone's map. There is no rail below 900px, so without this a
          phone had one scrolling page thousands of pixels long and no way to
          see what was on it. Same `.cv-dest` rows the client record uses, and
          the same glyphs as the rail, so a section reads the same whichever
          map you arrived by. Grouped like the rail for the same reason. */}
      {isMobile && !activeSection && railGroups.map(group => (
        <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
          <p style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 'var(--weight-medium)',
            margin: 0,
          }}>
            {group.label}
          </p>
          <nav className="cv-dest" aria-label={group.label}>
            {group.items.map(item => (
              <Link
                key={item.key}
                to={`/profile/${item.key}`}
                className="cv-dest-row ds-control"
              >
                <svg
                  className="cv-dest-icon" width="17" height="17" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="1.75"
                  strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                >
                  {SECTION_ICONS[item.key] || null}
                </svg>
                <span className="cv-dest-label">{item.label}</span>
                <Icon name="right" size={16} />
              </Link>
            ))}
          </nav>
        </div>
      ))}

      <SectionPanel hideTitle={isMobile} active={isVisible('account')} id="section-account" title="Account">

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Avatar url={avatarUrl} name={profile?.full_name || ''} size={64} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input ref={avatarInputRef} type="file" accept="image/*" onChange={onPickAvatar} style={{ display: 'none' }} />
              <Button onClick={() => avatarInputRef.current?.click()} variant="muted" size="sm" loading={avatarBusy}>
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
              {nameSaved ? <>Saved <Icon name="check" /></> : 'Save'}
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
          <p style={{ color: 'var(--color-text)', fontSize: 'var(--text-body)' }}>{session.user.email}</p>
        </div>
        <div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, marginBottom: '4px' }}>Member since</p>
          <p style={{ color: 'var(--color-text)', fontSize: 'var(--text-body)' }}>
            {new Date(session.user.created_at).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric'
            })}
          </p>
        </div>
        {profile?.role && (
          <div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, marginBottom: '4px' }}>Account type</p>
            <p style={{ color: 'var(--color-text)', fontSize: 'var(--text-body)', textTransform: 'capitalize' }}>
              {profile.role}
            </p>
          </div>
        )}
      </SectionPanel>

      <SectionPanel hideTitle={isMobile} active={isVisible('appearance')} id="section-appearance" title="Appearance">
        <AppearanceControls />
      </SectionPanel>

      {emailCategories.length > 0 && (
        <SectionPanel hideTitle={isMobile} active={isVisible('notifications')} id="section-notifications" title="Notifications">
          <p style={{ fontSize: 'var(--text-base)', marginTop: '-6px', color: 'var(--color-muted)' }}>
            Which emails we send you. Everything stays in the app either way, and
            account, security and billing emails are always sent.
          </p>
          {emailCategories.map(c => (
            <Toggle
              key={c.key}
              label={c.label}
              description={c.description}
              checked={isEnabled(emailPrefs, c.key)}
              onChange={() => toggleEmailCategory(c.key)}
              // Until the row has loaded, `emailPrefs` is null and every switch
              // would read as on. Disabled rather than hidden, so the panel does
              // not change height under the reader, and so a tap during the
              // round trip cannot write a map built from a guess.
              disabled={emailPrefs === null}
            />
          ))}
        </SectionPanel>
      )}

      {profile?.role !== 'coach' && (() => {
        const metric = bio.unit_preference === 'metric'
        const age = ageFromBirthDate(bio.birth_date)
        const isClient = profile?.role === 'client'
        const lbl = { fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: '6px', display: 'block' }
        return (
          <SectionPanel hideTitle={isMobile} active={isVisible('details')} id="section-details" title="Your details">
            <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', margin: 0 }}>
              {profile?.role === 'client'
                ? 'Your coach uses these to set your targets. Keep them accurate.'
                : 'Used to estimate your targets.'}
            </p>

            <div>
              <label style={lbl}>Units</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[['imperial', 'lb / ft·in'], ['metric', 'kg / cm']].map(([u, t]) => (
                  <Pill key={u} active={bio.unit_preference === u} aria-pressed={bio.unit_preference === u} onClick={() => changeBioUnits(u)}>{t}</Pill>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={lbl}>Sex</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[['male', 'Male'], ['female', 'Female']].map(([v, t]) => (
                    <Pill key={v} active={bio.sex === v} aria-pressed={bio.sex === v} onClick={() => setBio({ ...bio, sex: v })}>{t}</Pill>
                  ))}
                </div>
              </div>
              <div>
                <label style={lbl}>Date of birth{age != null ? ` · ${age} yrs` : ''}</label>
                <input type="date" className="dob-field" value={bio.birth_date} max={todayStr()} onChange={(e) => setBio({ ...bio, birth_date: e.target.value })} style={{ ...inputStyle, color: 'var(--color-text)', width: '100%', textAlign: 'center', height: '30px' }} />
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
              <label style={lbl}>Primary goal{isClient ? ' · set by your coach' : ''}</label>
              {/* A client does not choose this, so they do not get a row of
                  controls. C1: "a pill you can press is fine; a pill you cannot
                  press is decoration" — and four unpressable pills is also four
                  tab stops that announce as buttons and do nothing. The answer
                  is the answer, as text. */}
              {isClient ? (
                <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)', margin: 0 }}>
                  {goalLabel(bio.primary_goal) || <span style={{ color: 'var(--color-muted)' }}>Not set yet</span>}
                </p>
              ) : (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {GOALS.map((g) => {
                    const active = bio.primary_goal === g.key
                    return (
                      <Pill key={g.key} active={active} aria-pressed={active} onClick={() => setBio({ ...bio, primary_goal: g.key })}>{g.label}</Pill>
                    )
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Button onClick={saveBio} variant="primary" loading={bioSaving}>Save details</Button>
              {bioSaved && <span style={{ color: 'var(--color-primary)', fontSize: 'var(--text-sm)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>Saved <Icon name="check" /></span>}
            </div>
          </SectionPanel>
        )
      })()}

      {profile?.role !== 'coach' && (
      <SectionPanel hideTitle={isMobile} active={isVisible('targets')} id="section-targets" title="Daily targets">
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
              onChange={(e) => {
                const unit = e.target.value
                setTargets(prev => ({ ...prev, weight_goal_unit: unit, weight_goal: convertGoalValue(prev.weight_goal, prev.weight_goal_unit, unit) }))
              }}
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
            {saved ? <>Saved <Icon name="check" /></> : 'Save targets'}
          </Button>
        )}
      </SectionPanel>
      )}

      {profile?.role === 'coach' && (
        <SectionPanel hideTitle={isMobile} active={isVisible('questionnaire')} id="section-questionnaire" title="Check-in questionnaire">
          <CheckinBuilder coachId={profile.id} />
        </SectionPanel>
      )}

      {profile?.role === 'coach' && (
        <SectionPanel hideTitle={isMobile} active={isVisible('charts')} id="section-charts" title="Charts">
          <p style={{ fontSize: 'var(--text-base)', marginTop: '-8px', color: 'var(--color-muted)' }}>
            Choose which charts appear on your clients' records. All shown by default.
          </p>
          {CHART_TOGGLES.map(c => (
            <Toggle
              key={c.key}
              label={c.label}
              checked={!hiddenCharts.includes(c.key)}
              onChange={() => toggleChart(c.key)}
            />
          ))}
        </SectionPanel>
      )}

      {profile?.role === 'coach' && (
        <SectionPanel hideTitle={isMobile} active={isVisible('billing')} id="section-billing" title="Billing">
          {subscription ? (
            <div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, marginBottom: '4px' }}>Status</p>
              <p style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
                {STATUS_LABEL[subscription.status] ?? subscription.status}
              </p>
              {/* Suppressed while cancelling or paused, both for the same
                  reason: SubscriptionManager prints the date that actually
                  governs in those states, and this line would sit above it
                  wearing the opposite verb. A paused subscription does NOT
                  renew on its renewal date, which is exactly the kind of
                  sentence that is true of the column and false of the world. */}
              {subscriptionDate && DATE_LABEL[subscription.status]
                && !subscription.cancel_at_period_end && !isPaused && (
                <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
                  {DATE_LABEL[subscription.status]}{' '}
                  {new Date(subscriptionDate).toLocaleDateString()}
                </p>
              )}
              {/* No status gate here. Which controls apply is a function of the
                  status, and that decision now lives in SubscriptionManager so
                  there is one copy of it: a cancelled coach keeps a route to
                  their invoices (the half of the billing portal that outlives
                  the subscription), and a status with neither controls nor
                  history renders nothing. */}
              <SubscriptionManager subscription={subscription} onChange={() => window.location.reload()} />
            </div>
          ) : (
            <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>No active subscription.</p>
          )}
        </SectionPanel>
      )}

      {/* Solo billing is retired (Solo is free). Only show this card if the user
          still has a legacy active sub to manage, OR billing is re-enabled.
          When billing is off and there's nothing to manage, no dead paywall. */}
      {showSoloBilling && (
        <SectionPanel hideTitle={isMobile} active={isVisible('soloBilling')} id="section-soloBilling" title="Solo Premium">
          {soloSubActive ? (
            <div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, marginBottom: '4px' }}>Status</p>
              <p style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
                {STATUS_LABEL[soloSubscription.status] ?? soloSubscription.status}
              </p>
              {(soloSubscription.current_period_end || soloSubscription.trial_end) && DATE_LABEL[soloSubscription.status] && !soloSubscription.cancel_at_period_end && (
                <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
                  {DATE_LABEL[soloSubscription.status]}{' '}
                  {new Date(soloSubscription.current_period_end || soloSubscription.trial_end).toLocaleDateString()}
                </p>
              )}
              {/* `soloSubActive` above is already exactly these three statuses
                  minus a coaching pause, so the second gate was always true
                  here. Solo billing is retired, so this card stays scoped to a
                  legacy LIVE subscription rather than widening to cancelled
                  ones the way the coach card does. */}
              <SubscriptionManager subscription={soloSubscription} onChange={() => window.location.reload()} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
                Unlock advanced analytics — rolling weight average, compliance heatmap, weekend vs weekday split, best week analysis, and AI nutrition feedback.
              </p>
              <SoloUpgrade feature="Advanced analytics and AI nutrition feedback" />
            </div>
          )}
        </SectionPanel>
      )}

      <SectionPanel hideTitle={isMobile} active={isVisible('security')} id="section-security" title="Security">
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: 0, lineHeight: 1.6 }}>
          A password is optional. If you sign in with emailed codes you can carry on doing that —
          setting one here just gives you a second way in.
        </p>

        {pwStage === 'form' ? (
          <>
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
            <Button onClick={startPasswordChange} variant="primary" loading={pwBusy}>
              Update password
            </Button>
          </>
        ) : (
          <>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Confirmation code"
              maxLength={6}
              placeholder="000000"
              value={pwCode}
              onChange={(e) => setPwCode(e.target.value.replace(/\D/g, ''))}
              style={{ ...inputStyle, letterSpacing: '0.4em', textAlign: 'center', fontSize: 'var(--text-lg)' }}
            />
            {passwordStatus && (
              <p style={{
                fontSize: 'var(--text-base)',
                color: passwordStatus.includes('emailed') ? 'var(--color-muted)' : 'var(--color-error)'
              }}>
                {passwordStatus}
              </p>
            )}
            <div style={{ display: 'flex', gap: '12px' }}>
              <Button onClick={confirmPasswordChange} variant="primary" loading={pwBusy}>
                Confirm change
              </Button>
              <Button
                onClick={() => { setPwStage('form'); setPwCode(''); setPasswordStatus('') }}
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </>
        )}

        <div style={{ height: '1px', backgroundColor: 'var(--color-border)' }} />

        <SettingRow
          label="Sign out everywhere"
          description="Ends your session on every device, including ones you no longer have. Use this if a phone or laptop goes missing."
        >
          <Button onClick={signOutEverywhere} variant="muted" loading={globalSignOutBusy}>
            Sign out everywhere
          </Button>
        </SettingRow>
      </SectionPanel>

      {profile?.role !== 'coach' && (
        <SectionPanel hideTitle={isMobile} active={isVisible('health')} id="section-health" title="Apple Health">
          {healthConnection !== undefined && (
            <AppleHealthSettings
              userId={session.user.id}
              connection={healthConnection}
              onChange={reloadHealthConnection}
            />
          )}
        </SectionPanel>
      )}

      {/* Data */}
      <SectionPanel hideTitle={isMobile} active={isVisible('data')} id="section-data" title="Data">

        <SettingRow
          label="Export"
          description="Download all your logged data — nutrition, weight, cardio, and steps — as a JSON file."
        >
          <Button onClick={exportData} variant="muted" loading={exportLoading}>
            {exportLoading ? 'Exporting...' : 'Download data'}
          </Button>
        </SettingRow>

        <div style={{ height: '1px', backgroundColor: 'var(--color-border)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* `tone="danger"` colours the LABEL, not the row: B2 keeps colour in
              the thing it grades. The confirm stages below are a flow, not a
              control, so they stack under the row rather than sitting in it. */}
          <SettingRow
            label="Delete account"
            tone="danger"
            description="Permanently delete your account and all associated data. This cannot be undone."
          >
            {deleteStage === 'idle' && (
              <Button onClick={() => { setDeleteStage('confirm'); setDeleteError('') }} variant="danger">
                Delete my account
              </Button>
            )}
          </SettingRow>
          {deleteStage === 'idle' ? null : deleteStage === 'confirm' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-error)', fontWeight: 600, margin: 0 }}>
                Are you sure? This will delete all your data permanently.
              </p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: 0 }}>
                We'll email you a 6-digit code to confirm it's really you.
              </p>
              {deleteError && (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-error)', margin: 0 }}>{deleteError}</p>
              )}
              <div style={{ display: 'flex', gap: '12px' }}>
                <Button onClick={requestDeleteCode} variant="danger-solid" loading={codeSending}>
                  {codeSending ? 'Sending code...' : 'Email me a code'}
                </Button>
                <Button onClick={() => { setDeleteStage('idle'); setDeleteError('') }} variant="ghost">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: 0 }}>
                Enter the 6-digit code we emailed you. It expires in 10 minutes.
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="Deletion confirmation code"
                maxLength={6}
                placeholder="000000"
                value={deleteCode}
                onChange={(e) => setDeleteCode(e.target.value.replace(/\D/g, ''))}
                style={{ ...inputStyle, letterSpacing: '0.4em', textAlign: 'center', fontSize: 'var(--text-lg)', maxWidth: '220px' }}
              />
              {deleteError && (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-error)', margin: 0 }}>{deleteError}</p>
              )}
              <div style={{ display: 'flex', gap: '12px' }}>
                <Button onClick={deleteAccount} variant="danger-solid" loading={deleteLoading}>
                  {deleteLoading ? 'Deleting...' : 'Yes, delete everything'}
                </Button>
                <Button
                  onClick={() => { setDeleteStage('idle'); setDeleteCode(''); setDeleteError('') }}
                  variant="ghost"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </SectionPanel>

      {/* The phone's sign-out, on the MENU only. The mobile tab bar has no
          sign-out (the old hamburger did), so this page carries it — but once
          every section became its own page it started appearing at the foot of
          all eight of them, under Billing and under Delete account. Sign out
          belongs where you choose where to go, not stapled to whatever you
          happened to open. Desktop keeps it in the top-bar account menu. */}
      {isMobile && !activeSection && (
        <div style={{ padding: 'var(--space-20) 0 0' }}>
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
