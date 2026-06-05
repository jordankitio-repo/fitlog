import { useState } from 'react'
import { supabase } from '../supabase'
import Button from './Button'

export default function SoloUpgrade({ feature = 'this feature', compact = false }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleUpgrade() {
    setLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            priceId: import.meta.env.VITE_STRIPE_SOLO_PRICE_ID?.trim(),
          }),
        }
      )
      const json = await res.json()

      if (json.url) {
        window.location.href = json.url
      } else {
        setError('Could not start checkout. Try again.')
      }
    } catch {
      setError('Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  if (compact) {
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <Button onClick={handleUpgrade} variant="ghost" loading={loading}>
          🔒 Upgrade to unlock
        </Button>
        {error && <span style={{ fontSize: 'var(--text-xs)', color: '#f87171' }}>{error}</span>}
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: '24px',
      textAlign: 'center',
    }}>
      <p style={{ fontSize: '1.25rem', marginBottom: 8 }}>🔒</p>
      <p style={{
        fontWeight: 600,
        color: 'var(--color-text)',
        fontSize: 'var(--text-md)',
        marginBottom: 8,
      }}>
        Solo Premium
      </p>
      <p style={{
        color: 'var(--color-muted)',
        fontSize: 'var(--text-sm)',
        marginBottom: 24,
        lineHeight: 1.6,
      }}>
        {feature} is part of Solo Premium. Start your 14-day free trial - $7.99/month after.
      </p>
      {error && (
        <p style={{ color: '#f87171', fontSize: 'var(--text-sm)', marginBottom: 12 }}>{error}</p>
      )}
      <Button variant="primary" onClick={handleUpgrade} loading={loading} fullWidth>
        {loading ? 'Redirecting...' : 'Start 14-day free trial'}
      </Button>
      <p style={{ marginTop: 16, fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
        <a href="/terms" style={{ color: 'var(--color-muted)' }}>Terms</a>
        {' · '}
        <a href="/privacy" style={{ color: 'var(--color-muted)' }}>Privacy</a>
      </p>
    </div>
  )
}
