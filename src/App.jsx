import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Dashboard from './pages/Dashboard'
import Log from './pages/Log'
import Profile from './pages/Profile'
import Login from './pages/Login'
import NavBar from './components/NavBar'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) return <p style={{ padding: '24px' }}>Loading...</p>

  return (
    <BrowserRouter>
      {session && <NavBar />}
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 16px' }}>
        <Routes>
          <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
          <Route path="/" element={session ? <Dashboard /> : <Navigate to="/login" />} />
          <Route path="/log" element={session ? <Log /> : <Navigate to="/login" />} />
          <Route path="/profile" element={session ? <Profile /> : <Navigate to="/login" />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}

export default App