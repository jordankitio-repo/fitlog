import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Log from './pages/Log'
import Profile from './pages/Profile'
import NavBar from './components/NavBar'

function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <main style={{maxWidth: '800px', margin: '0 auto', padding: '24px 16px' }}></main>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/log" element={<Log />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App