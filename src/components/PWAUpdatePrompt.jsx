import { useRegisterSW } from 'virtual:pwa-register/react'

// Shows an in-app "new version available" banner for PWA users (there's no
// browser refresh button in a standalone PWA). Clicking Update activates the
// waiting service worker and reloads onto the latest deploy. Also polls for
// updates hourly and whenever the app regains focus, so a long-open install
// actually notices a new release.
export default function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return
      const check = () => { registration.update().catch(() => {}) }
      setInterval(check, 60 * 60 * 1000) // hourly
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })

  if (!needRefresh) return null

  return (
    <div
      role="status"
      style={{
        position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 3000,
        maxWidth: 420, margin: '0 auto',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)', padding: '12px 14px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--color-text)' }}>
        A new version of Gardnr is available.
      </span>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: 'var(--color-primary)', color: '#fff', border: 'none',
          borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
        }}
      >
        Update
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        aria-label="Dismiss"
        style={{
          background: 'transparent', color: 'var(--color-muted)', border: 'none',
          cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: '0 4px',
        }}
      >
        ×
      </button>
    </div>
  )
}
