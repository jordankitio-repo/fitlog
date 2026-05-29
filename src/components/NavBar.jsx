import { Link } from 'react-router-dom'

function NavBar() {
  return (
    <nav style={{
      backgroundColor: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-border)',
      padding: '0 24px',
      display: 'flex',
      gap: '24px',
      alignItems: 'center',
      height: '56px'
    }}>
      <span style={{ fontWeight: 700, color: 'var(--color-primary)', marginRight: 'auto' }}>
        FitLog
      </span>
      <Link to="/" style={{ color: 'var(--color-text)', textDecoration: 'none' }}>Dashboard</Link>
      <Link to="/log" style={{ color: 'var(--color-text)', textDecoration: 'none' }}>Log</Link>
      <Link to="/profile" style={{ color: 'var(--color-text)', textDecoration: 'none' }}>Profile</Link>
    </nav>
  )
}

export default NavBar