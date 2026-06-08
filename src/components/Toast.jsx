import { useEffect } from 'react'

function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [message])

  if (!message) return null

  const colors = {
    success: { bg: '#064e3b', border: '#34d399', color: '#34d399' },
    error: { bg: '#450a0a', border: '#f87171', color: '#f87171' },
    info: { bg: '#052e16', border: '#22c55e', color: '#22c55e' },
  }

  const c = colors[type]

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      backgroundColor: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 'var(--radius)',
      padding: '12px 20px',
      color: c.color,
      fontWeight: 600,
      fontSize: '0.875rem',
      zIndex: 1000,
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      animation: 'fadeIn 0.2s ease forwards',
      maxWidth: '320px',
    }}>
      {message}
    </div>
  )
}

export default Toast
