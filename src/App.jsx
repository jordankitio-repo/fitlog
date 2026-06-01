import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Dashboard from './pages/Dashboard'
import Log from './pages/Log'
import Profile from './pages/Profile'
import Login from './pages/Login'
import NavBar from './components/NavBar'
import CoachDashboard from './pages/CoachDashboard'
import Join from './pages/Join'
import ClientView from './pages/ClientView'
import ResetPassword from './pages/ResetPassword'
import RolePicker from './pages/RolePicker'

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) console.error('Error fetching profile:', error)
    else setProfile(data)
    setLoading(false)
  }

  if (loading) return <p style={{ padding: '24px' }}>Loading...</p>

  if (session && profile && !profile.role) {
    return <RolePicker session={session} onComplete={() => fetchProfile(session.user.id)} />
  }

  return (
    <BrowserRouter>
      {session && <NavBar profile={profile} />}
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 16px' }}>
        <Routes>
          <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
          <Route path="/" element={session ? (
            profile?.role === 'coach'
              ? <CoachDashboard profile={profile} />
              : <Dashboard profile={profile} />
          ) : <Navigate to="/login" />} />
          <Route path="/log" element={session ? <Log session={session} profile={profile} /> : <Navigate to="/login" />} />
          <Route path="/profile" element={session ? <Profile session={session} profile={profile} /> : <Navigate to="/login" />} />
          <Route path="/join" element={<Join />} />
          <Route path="/client/:clientId" element={session ? <ClientView profile={profile} /> : <Navigate to="/login" />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}

export default App
