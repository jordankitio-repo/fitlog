import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import Button from './Button'

export default function SoloUpgrade({ feature = 'this feature', compact = false }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [trialUsed, setTrialUsed] = useState(false)

  useEffect(() => {
    async function checkEligibility() {
      try {
        // getSession can return null on first render while auth initialises — retry once
        let session = (await supabase.auth.getSession()).data.session
        if (!session) {
          await new Promise((r) => setTimeout(r, 800))
          session = (await supabase.auth.getSession()).data.session
        }
        if (!session) return
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-trial-eligibility`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        )
        const json = await res.json()
        if (json.solo_trial_used) setTrialUsed(true)
      } catch {
        // silently ignore — worst case the trial CTA shows and checkout reflects reality
      }
    }
    checkEligibility()
  }, [])

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
          // No priceId — the server resolves it from our verified role. See
          // create-checkout-session.
          body: JSON.stringify({}),
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
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
      }}>
        <span style={{ fontSize: '0.9rem' }}>🔒</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text)' }}>
            Solo Premium
          </p>
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
            AI feedback
          </p>
        </div>
        <Button onClick={handleUpgrade} variant="primary" loading={loading}>
          Upgrade
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
        {feature} is part of Solo Premium.
        {trialUsed && " You've already used your free trial, so you'll be charged immediately."}
      </p>
      {error && (
        <p style={{ color: '#f87171', fontSize: 'var(--text-sm)', marginBottom: 12 }}>{error}</p>
      )}
      <Button variant="primary" onClick={handleUpgrade} loading={loading} fullWidth>
        {loading ? 'Redirecting...' : trialUsed ? 'Subscribe to Solo Premium' : 'Start 14-day free trial'}
      </Button>
      <p style={{ marginTop: 16, fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
        <a href="/terms" style={{ color: 'var(--color-muted)' }}>Terms</a>
        {' · '}
        <a href="/privacy" style={{ color: 'var(--color-muted)' }}>Privacy</a>
        {' · '}
        <a href="/health-data-privacy" style={{ color: 'var(--color-muted)' }}>Health Data</a>
      </p>
    </div>
  )
}
