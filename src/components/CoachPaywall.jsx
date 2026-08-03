import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import Button from './Button'
import FeedbackButton from './FeedbackButton'

function CoachPaywall({ subscription, profile, onSignOut }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [trialUsed, setTrialUsed] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [cadence, setCadence] = useState('annual')

  const isCanceled = subscription?.status === 'canceled'

  // Coach billing cadences. The client sends only the KEY; create-checkout-session
  // resolves the real Stripe price server-side from role + key (never a price from
  // the browser). Keep these keys in sync with COACH_CADENCE_PRICE_IDS there.
  const PLANS = [
    { key: 'monthly', name: 'Monthly', amount: '$49', billed: '$49/month', badge: null },
    { key: '6mo', name: '6-month', amount: '$264', billed: '$264 every 6 months ($44/mo)', badge: 'Save 10%' },
    { key: 'annual', name: 'Annual', amount: '$490', billed: '$490/year ($41/mo)', badge: '2 months free' },
  ]
  const plan = PLANS.find((p) => p.key === cadence) ?? PLANS[0]

  useEffect(() => {
    async function checkEligibility() {
      try {
        let session = null
        // getSession can return null on first render if auth is still initialising — retry once
        const first = await supabase.auth.getSession()
        session = first.data.session
        if (!session) {
          await new Promise((r) => setTimeout(r, 800))
          const second = await supabase.auth.getSession()
          session = second.data.session
        }
        if (!session) return
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-trial-eligibility`,
          { headers: { 'Authorization': `Bearer ${session.access_token}` } }
        )
        const json = await res.json()
        if (json.coach_trial_used) setTrialUsed(true)
      } catch {
        // silently ignore — worst case user sees trial CTA and gets blocked at checkout
      }
    }
    checkEligibility()
  }, [])

  async function confirmDelete() {
    setShowDeleteConfirm(false)
    setDeleting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })
      const data = await res.json().catch(() => ({}))
      // Only sign out once the server confirms deletion — otherwise the user is
      // logged out believing their account is gone when it isn't. (Matches the
      // Profile delete path.)
      if (!res.ok || !data.success) {
        setDeleting(false)
        setError('Could not delete account. Try again.')
        return
      }
      await supabase.auth.signOut()
    } catch {
      setDeleting(false)
      setError('Could not delete account. Try again.')
    }
  }

  async function handleStartTrial() {
    if (trialUsed && !isCanceled) {
      setShowConfirm(true)
      return
    }
    await proceedToCheckout()
  }

  async function proceedToCheckout() {
    setShowConfirm(false)
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
          // Send only the cadence KEY, never a price. The server resolves the
          // Stripe price from our verified role + this key — see
          // create-checkout-session. Sending a price meant it lived in the JS
          // bundle, where anyone could swap it for a cheaper one.
          body: JSON.stringify({ cadence }),
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

  const ctaLabel = loading
    ? 'Redirecting...'
    : isCanceled
      ? `Reactivate — ${plan.billed}`
      : trialUsed
        ? `Subscribe — ${plan.billed}`
        : 'Start 14-day free trial'

  const subtitle = isCanceled
    ? "Your coaching access has ended. Your data and your clients' data are safe. Reactivate anytime to regain access."
    : trialUsed
      ? `You have already used your free trial. Subscribing will charge you ${plan.amount} immediately.`
      : `Gardnr for coaches is ${plan.billed}, unlimited clients. Start with 14 days free — you will not be charged until your trial ends.`

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
          {isCanceled ? 'Your subscription ended' : trialUsed ? 'Subscribe to Gardnr' : 'Start your free trial'}
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)', marginBottom: 32, lineHeight: 1.6 }}>
          {subtitle}
        </p>

        {error && (
          <p style={{ color: '#f87171', fontSize: 'var(--text-sm)', marginBottom: 16 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {PLANS.map((p) => {
              const selected = p.key === cadence
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setCadence(p.key)}
                  aria-pressed={selected}
                  style={{
                    flex: 1,
                    cursor: 'pointer',
                    padding: '12px 8px',
                    borderRadius: 'var(--radius)',
                    border: selected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: selected ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
                    color: 'var(--color-text)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>{p.amount}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-primary)', marginTop: 4, fontWeight: 600, minHeight: 13 }}>
                    {p.badge || ''}
                  </div>
                </button>
              )
            })}
        </div>

        <Button variant="primary" onClick={handleStartTrial} loading={loading} fullWidth style={{ marginBottom: 12 }}>
          {ctaLabel}
        </Button>

        <button
          onClick={onSignOut}
          style={{ background: 'none', border: 'none', color: 'var(--color-muted)', fontSize: 'var(--text-sm)', cursor: 'pointer', marginTop: 8 }}
        >
          Sign out
        </button>
        <br />
        <button
          onClick={() => setShowDeleteConfirm(true)}
          disabled={deleting}
          style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 'var(--text-xs)', cursor: 'pointer', marginTop: 8 }}
        >
          {deleting ? 'Deleting…' : 'Delete account'}
        </button>

        <div style={{ marginTop: 16 }}>
          <FeedbackButton userEmail={profile?.email || ''} userName={profile?.full_name || ''} />
        </div>
      </div>

      <p style={{ marginTop: 24, fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
        <a href="/terms" style={{ color: 'var(--color-muted)' }}>Terms</a>
        {' | '}
        <a href="/privacy" style={{ color: 'var(--color-muted)' }}>Privacy</a>
        {' | '}
        <a href="/health-data-privacy" style={{ color: 'var(--color-muted)' }}>Health Data</a>
      </p>

      {showConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24,
        }}>
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)', padding: '32px 28px', maxWidth: 400, width: '100%', textAlign: 'center',
          }}>
            <h2 style={{ fontSize: 'var(--text-base)', marginBottom: 12 }}>No trial remaining</h2>
            <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.6, marginBottom: 24 }}>
              You've already used your 14-day free trial. Continuing will charge your card <strong style={{ color: 'var(--color-text)' }}>{plan.amount} immediately</strong>.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <Button variant="ghost" onClick={() => setShowConfirm(false)}>Cancel</Button>
              <Button variant="primary" onClick={proceedToCheckout}>Continue — {plan.billed}</Button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24,
        }}>
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)', padding: '32px 28px', maxWidth: 400, width: '100%', textAlign: 'center',
          }}>
            <h2 style={{ fontSize: 'var(--text-base)', marginBottom: 12 }}>Delete account</h2>
            <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.6, marginBottom: 24 }}>
              Permanently delete your account and all associated data? <strong style={{ color: 'var(--color-text)' }}>This cannot be undone.</strong>
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              <Button variant="danger-solid" onClick={confirmDelete} loading={deleting}>
                {deleting ? 'Deleting…' : 'Delete everything'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CoachPaywall
