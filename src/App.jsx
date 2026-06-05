import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import Dashboard from './pages/Dashboard'
import Log from './pages/Log'
import Profile from './pages/Profile'
import Login from './pages/Login'
import Landing from './pages/Landing'
import NavBar from './components/NavBar'
import CoachPaywall from './components/CoachPaywall'
import CoachDashboard from './pages/CoachDashboard'
import Join from './pages/Join'
import ClientView from './pages/ClientView'
import ResetPassword from './pages/ResetPassword'
import RolePicker from './pages/RolePicker'
import BillingSuccess from './pages/BillingSuccess'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'

export const BILLING_ENABLED = true
export const SOLO_BILLING_ENABLED = true
const PUBLIC_ROUTES = ['/billing/success', '/terms', '/privacy']

function AppRoutes({ session, profile, subscription, soloSubscription, hasSoloPremium }) {
  const location = useLocation()
  const isLanding = !session && location.pathname === '/'

  const mainStyle = isLanding
    ? { width: '100%' }
    : { maxWidth: '800px', margin: '0 auto', padding: '24px 16px' }

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
          ) : <Landing />} />
          <Route path="/log" element={session ? <Log session={session} profile={profile} hasSoloPremium={hasSoloPremium} /> : <Navigate to="/login" />} />
          <Route path="/profile" element={session ? <Profile session={session} profile={profile} subscription={subscription} soloSubscription={soloSubscription} hasSoloPremium={hasSoloPremium} /> : <Navigate to="/login" />} />
          <Route path="/join" element={<Join />} />
          <Route path="/client/:clientId" element={session ? <ClientView profile={profile} /> : <Navigate to="/login" />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/billing/success" element={<BillingSuccess />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
        </Routes>
      </main>
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
  const [soloSubLoading, setSoloSubLoading] = useState(false)

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
        .select('status, trial_end, current_period_end, stripe_price_id')
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
        .select('status, trial_end, current_period_end, stripe_price_id, paused_for_coaching')
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
    profile?.role !== 'solo' ||
    (PAID_STATUSES.includes(soloSubscription?.status) && !soloSubscription?.paused_for_coaching)

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

  if (loading) return <p style={{ padding: '24px' }}>Loading...</p>

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
    return <p style={{ padding: '24px' }}>Loading...</p>
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
      />
    </BrowserRouter>
  )
}

export default App
