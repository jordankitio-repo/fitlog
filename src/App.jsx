import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import Dashboard from './pages/Dashboard'
import Log from './pages/Log'
import Profile from './pages/Profile'
import Login from './pages/Login'
import Landing from './pages/Landing'
import NavBar from './components/NavBar'
import LoadingScreen from './components/LoadingScreen'
import { useMediaQuery } from './hooks/useMediaQuery'
import ClientChat from './components/ClientChat'
import PWAUpdatePrompt from './components/PWAUpdatePrompt'
import CoachPaywall from './components/CoachPaywall'
import CoachDashboard from './pages/CoachDashboard'
import Join from './pages/Join'
import ClientView from './pages/ClientView'
import ResetPassword from './pages/ResetPassword'
import RolePicker from './pages/RolePicker'
import BillingSuccess from './pages/BillingSuccess'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'

// Coach paywall is OFF for now — coaches use the app free while we're
// pre-public. Flip back to `true` to re-enable the paywall + trial gating when
// it's time to go public and charge. (Subscriptions are still fetched/shown;
// they just no longer gate access to the dashboard.)
export const BILLING_ENABLED = false
// Solo is free: the paid Solo tier is retired so all self-serve analytics are
// free (Solo is the funnel, coaches are the business). Flipping this back to
// true re-enables solo billing and the upgrade prompts. `hasSoloPremium`
// becomes always-true while this is false (see below).
export const SOLO_BILLING_ENABLED = false
const PUBLIC_ROUTES = ['/billing/success', '/terms', '/privacy']

function AppRoutes({ session, profile, subscription, soloSubscription, hasSoloPremium, onProfileUpdate }) {
  const location = useLocation()
  const path = location.pathname
  const isMobile = useMediaQuery('(max-width: 600px)')
  // On phones the marketing landing (built for hover/desktop) is replaced by the
  // sign-in form as the home screen — login IS the landing on mobile. The
  // full-bleed landing treatment then only applies to the desktop marketing page.
  const showLoginAsHome = !session && path === '/' && isMobile
  const isLanding = !session && path === '/' && !isMobile

  // App screens (every role's dashboard at `/`, the daily log at /log, the
  // profile, and a client's full record at /client/:id) get the full width so
  // they're visually consistent. Only the auth/standalone pages stay narrow.
  const isWideScreen =
    path === '/' || path === '/log' || path === '/profile' || path.startsWith('/client/')
  // The rail + content pages (a client's full record and the coach/settings
  // Profile) get extra room so they span the same width instead of one sitting
  // in a narrower column than the other.
  const isExtraWide = path.startsWith('/client/') || path === '/profile'

  // Clients carry the floating chat bubble (FAB, bottom-right) on every page;
  // give the content extra bottom clearance so it never sits on a control
  // (e.g. the "Log Steps" button) when scrolled to the end.
  const hasChatFab = profile?.role === 'client'
  const mainStyle = isLanding
    ? { width: '100%' }
    : { maxWidth: isExtraWide ? '1560px' : isWideScreen ? '1180px' : '800px', margin: '0 auto', padding: hasChatFab ? '24px 16px 96px' : '24px 16px' }

  return (
    <>
      {session && <NavBar profile={profile} />}
      <main style={mainStyle}>
        <Routes>
          <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
          <Route path="/" element={session ? (
            profile?.role === 'coach'
              ? <CoachDashboard profile={profile} />
              : <Dashboard profile={profile} hasSoloPremium={hasSoloPremium} />
          ) : (showLoginAsHome ? <Login /> : <Landing />)} />
          <Route path="/log" element={session ? <Log session={session} profile={profile} hasSoloPremium={hasSoloPremium} /> : <Navigate to="/login" />} />
          <Route path="/profile" element={session ? <Profile session={session} profile={profile} subscription={subscription} soloSubscription={soloSubscription} hasSoloPremium={hasSoloPremium} onProfileUpdate={onProfileUpdate} /> : <Navigate to="/login" />} />
          <Route path="/join" element={<Join />} />
          <Route path="/client/:clientId" element={session ? <ClientView profile={profile} /> : <Navigate to="/login" />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/billing/success" element={<BillingSuccess />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {/* Client chat bubble — mounted at the layout level so it's available on
          every authenticated page, not just the dashboard. */}
      {session && profile?.role === 'client' && <ClientChat profile={profile} />}
      {/* In-app "new version available" prompt for PWA users. */}
      <PWAUpdatePrompt />
    </>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState(null)
  const [subLoading, setSubLoading] = useState(false)
  const [soloSubscription, setSoloSubscription] = useState(null)
  const [, setSoloSubLoading] = useState(false)

  const fetchProfile = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error fetching profile:', error)
      setLoading(false)
      return
    }

    setProfile(data)
    setLoading(false)
  }, [])

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setSubscription(null)
    setSoloSubscription(null)
    setLoading(false)
    setSubLoading(false)
    setSoloSubLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        setLoading(true)
        fetchProfile(session.user.id)
      }
      else setLoading(false)
    }).catch(() => {
      supabase.auth.signOut()
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return

      setSession(session)
      if (session) {
        setLoading(true)
        fetchProfile(session.user.id)
      }
      else {
        setProfile(null)
        setSubscription(null)
        setSoloSubscription(null)
        setLoading(false)
        setSubLoading(false)
        setSoloSubLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  // Dismiss the cold-start splash (index.html) once the app shell is ready.
  useEffect(() => {
    if (!loading) window.hideSplash?.()
  }, [loading])

  useEffect(() => {
    if (profile?.role !== 'coach') {
      setSubscription(null)
      setSubLoading(false)
      return
    }

    let active = true

    async function fetchSubscription() {
      setSubLoading(true)
      const { data, error } = await supabase
        .from('subscriptions')
        .select('status, trial_end, current_period_end, stripe_price_id, cancel_at_period_end')
        .eq('coach_id', profile.id)
        .maybeSingle()

      if (!active) return

      if (error) console.error('Error fetching subscription:', error)
      setSubscription(data || null)
      setSubLoading(false)
    }

    fetchSubscription()

    return () => {
      active = false
    }
  }, [profile])

  useEffect(() => {
    if (profile?.role !== 'solo') {
      setSoloSubscription(null)
      setSoloSubLoading(false)
      return
    }

    let active = true

    async function fetchSoloSubscription() {
      setSoloSubLoading(true)
      const { data, error } = await supabase
        .from('subscriptions')
        .select('status, trial_end, current_period_end, stripe_price_id, paused_for_coaching, cancel_at_period_end')
        .eq('solo_id', profile.id)
        .maybeSingle()

      if (!active) return
      if (error) console.error('Error fetching solo subscription:', error)
      setSoloSubscription(data || null)
      setSoloSubLoading(false)
    }

    fetchSoloSubscription()

    return () => {
      active = false
    }
  }, [profile])

  const PAID_STATUSES = ['trialing', 'active', 'past_due']

  const hasSoloPremium =
    !SOLO_BILLING_ENABLED ||
    (profile?.role === 'solo' &&
      PAID_STATUSES.includes(soloSubscription?.status) &&
      !soloSubscription?.paused_for_coaching)

  if (PUBLIC_ROUTES.includes(window.location.pathname)) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/billing/success" element={<BillingSuccess />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
        </Routes>
      </BrowserRouter>
    )
  }

  if (loading) return <LoadingScreen />

  if (session && profile && !profile.role) {
    return (
      <RolePicker
        session={session}
        onComplete={() => fetchProfile(session.user.id)}
        onCancel={handleSignOut}
      />
    )
  }

  if (BILLING_ENABLED && profile?.role === 'coach' && subLoading) {
    return <LoadingScreen />
  }

  if (BILLING_ENABLED && profile?.role === 'coach') {
    const status = subscription?.status

    if (!status || !PAID_STATUSES.includes(status)) {
      return <CoachPaywall subscription={subscription} profile={profile} onSignOut={handleSignOut} />
    }
  }

  return (
    <BrowserRouter>
      <AppRoutes
        session={session}
        profile={profile}
        subscription={subscription}
        soloSubscription={soloSubscription}
        hasSoloPremium={hasSoloPremium}
        onProfileUpdate={() => fetchProfile(session.user.id)}
      />
    </BrowserRouter>
  )
}

export default App
