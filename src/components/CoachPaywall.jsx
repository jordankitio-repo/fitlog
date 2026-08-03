import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import Button from './Button'
import Logo from './Logo'
import FeedbackButton from './FeedbackButton'

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// Real, shipped capabilities — no fabricated metrics or social proof.
const FEATURES = [
  'Unlimited clients — never pay per seat',
  'AI weekly reports & call-prep briefings',
  'Compliance triage + one-tap check-in review',
  'Cancel anytime — your data stays yours',
]

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
    { key: 'monthly', name: 'Monthly', amount: '$49', period: 'per month', permo: '', badge: null },
    { key: '6mo', name: '6 months', amount: '$264', period: 'per 6 months', permo: '$44/mo', badge: { text: 'Save 10%', tone: 'soft' } },
    { key: 'annual', name: 'Annual', amount: '$490', period: 'per year', permo: '$41/mo', badge: { text: '2 months free', tone: 'solid' } },
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

  const headline = isCanceled ? 'Welcome back' : trialUsed ? 'Choose your plan' : 'Start your 14-day free trial'
  const subhead = isCanceled
    ? 'Reactivate to pick up right where you and your clients left off — all your data is safe.'
    : trialUsed
      ? 'Your free trial has been used. Pick a plan to keep coaching without a break.'
      : 'Everything you need to run your coaching — unlimited clients, AI reports, and compliance at a glance.'

  const ctaLabel = loading
    ? 'Redirecting…'
    : isCanceled
      ? `Reactivate — ${plan.amount}`
      : trialUsed
        ? `Subscribe — ${plan.amount}`
        : 'Start 14-day free trial'

  const reassure = (isCanceled || trialUsed)
    ? 'Secure checkout via Stripe · Cancel anytime'
    : 'Secure checkout via Stripe · No charge for 14 days · Cancel anytime'

  return (
    <div className="pw-page">
      <div className="pw-card">
        <div className="pw-head">
          <span className="pw-head-logo"><Logo size={48} /></span>
          <h1 className="pw-title">{headline}</h1>
          <p className="pw-sub">{subhead}</p>
        </div>

        {error && <p className="pw-error">{error}</p>}

        <div className="pw-plans" role="radiogroup" aria-label="Billing plan">
          {PLANS.map((p) => {
            const selected = p.key === cadence
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${p.name}, ${p.amount} ${p.period}${p.badge ? ', ' + p.badge.text : ''}`}
                onClick={() => setCadence(p.key)}
                className={`pw-plan${selected ? ' selected' : ''}`}
              >
                <span className={`pw-plan-badge ${p.badge ? p.badge.tone : 'ghost'}`}>
                  {p.badge ? p.badge.text : ' '}
                </span>
                <span className="pw-plan-name">{p.name}</span>
                <span className="pw-plan-price">{p.amount}</span>
                <span className="pw-plan-period">{p.period}</span>
                <span className="pw-plan-permo">{p.permo}</span>
              </button>
            )
          })}
        </div>

        <ul className="pw-features">
          {FEATURES.map((f) => (
            <li className="pw-feature" key={f}><CheckIcon />{f}</li>
          ))}
        </ul>

        <Button
          variant="primary"
          size="lg"
          onClick={handleStartTrial}
          loading={loading}
          fullWidth
          style={{ fontWeight: 700, boxShadow: '0 10px 26px -10px color-mix(in srgb, var(--color-primary) 55%, transparent)' }}
        >
          {ctaLabel}
        </Button>
        <p className="pw-reassure"><LockIcon />{reassure}</p>

        <div className="pw-secondary">
          <button type="button" className="pw-linkbtn" onClick={onSignOut}>Sign out</button>
          <span className="pw-dot">·</span>
          <button type="button" className="pw-linkbtn danger" onClick={() => setShowDeleteConfirm(true)} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
        <div className="pw-feedback">
          <FeedbackButton userEmail={profile?.email || ''} userName={profile?.full_name || ''} />
        </div>
      </div>

      <p className="pw-legal">
        <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/health-data-privacy">Health Data</a>
      </p>

      {showConfirm && (
        <div className="pw-modal-overlay">
          <div className="pw-modal">
            <h2>No trial remaining</h2>
            <p>You&apos;ve already used your 14-day free trial. Continuing will charge your card <strong style={{ color: 'var(--color-text)' }}>{plan.amount} today</strong>.</p>
            <div className="pw-modal-actions">
              <Button variant="ghost" onClick={() => setShowConfirm(false)}>Cancel</Button>
              <Button variant="primary" onClick={proceedToCheckout}>Continue — {plan.amount}</Button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="pw-modal-overlay">
          <div className="pw-modal">
            <h2>Delete account</h2>
            <p>Permanently delete your account and all associated data? <strong style={{ color: 'var(--color-text)' }}>This cannot be undone.</strong></p>
            <div className="pw-modal-actions">
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
