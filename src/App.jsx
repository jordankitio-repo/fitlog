import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import Dashboard from './pages/Dashboard'
import Log from './pages/Log'
import Profile from './pages/Profile'
import Login from './pages/Login'
import Landing from './pages/Landing'
import NavBar from './components/NavBar'
import CoachDashboard from './pages/CoachDashboard'
import Join from './pages/Join'
import ClientView from './pages/ClientView'
import ResetPassword from './pages/ResetPassword'
import RolePicker from './pages/RolePicker'
import BillingSuccess from './pages/BillingSuccess'

export const BILLING_ENABLED = false

function AppRoutes({ session, profile }) {
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
              : <Dashboard profile={profile} />
          ) : <Landing />} />
          <Route path="/log" element={session ? <Log session={session} profile={profile} /> : <Navigate to="/login" />} />
          <Route path="/profile" element={session ? <Profile session={session} profile={profile} /> : <Navigate to="/login" />} />
          <Route path="/join" element={<Join />} />
          <Route path="/client/:clientId" element={session ? <ClientView profile={profile} /> : <Navigate to="/login" />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/billing/success" element={<BillingSuccess />} />
        </Routes>
      </main>
    </>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

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
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  if (window.location.pathname === '/billing/success') {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/billing/success" element={<BillingSuccess />} />
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
        onCancel={async () => {
          await supabase.auth.signOut()
          setSession(null)
          setProfile(null)
          setLoading(false)
        }}
      />
    )
  }

  return (
    <BrowserRouter>
      <AppRoutes session={session} profile={profile} />
    </BrowserRouter>
  )
}

export default App
