import { useState } from 'react'
import { supabase } from '../supabase'
import Button from './Button'
import FeedbackButton from './FeedbackButton'

function CoachPaywall({ subscription, profile, onSignOut }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const isCanceled = subscription?.status === 'canceled'

  async function handleStartTrial() {
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
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            priceId: import.meta.env.VITE_STRIPE_FOUNDING_PRICE_ID?.trim(),
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

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        padding: '40px 32px',
        maxWidth: 480,
        width: '100%',
        textAlign: 'center',
      }}>
        <h1 style={{ fontSize: 'var(--text-lg)', marginBottom: 8 }}>
          {isCanceled ? 'Your subscription ended' : 'Start your free trial'}
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)', marginBottom: 32, lineHeight: 1.6 }}>
          {isCanceled
            ? "Your coaching access has ended. Your data and your clients' data are safe. Reactivate anytime to regain access."
            : 'FitLog for coaches is $19/month. Start with 30 days free. You will not be charged until your trial ends.'
          }
        </p>

        {error && (
          <p style={{ color: '#f87171', fontSize: 'var(--text-sm)', marginBottom: 16 }}>{error}</p>
        )}

        <Button variant="primary" onClick={handleStartTrial} loading={loading} fullWidth style={{ marginBottom: 12 }}>
          {loading ? 'Redirecting...' : isCanceled ? 'Reactivate - $19/month' : 'Start 30-day free trial'}
        </Button>

        <button
          onClick={onSignOut}
          style={{ background: 'none', border: 'none', color: 'var(--color-muted)', fontSize: 'var(--text-sm)', cursor: 'pointer', marginTop: 8 }}
        >
          Sign out
        </button>

        <div style={{ marginTop: 16 }}>
          <FeedbackButton userEmail={profile?.email || ''} userName={profile?.full_name || ''} />
        </div>
      </div>

      <p style={{ marginTop: 24, fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
        <a href="/terms" style={{ color: 'var(--color-muted)' }}>Terms</a>
        {' | '}
        <a href="/privacy" style={{ color: 'var(--color-muted)' }}>Privacy</a>
      </p>
    </div>
  )
}

export default CoachPaywall
