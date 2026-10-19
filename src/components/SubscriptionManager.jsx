import { useState } from 'react'
import { supabase } from '../supabase'
import Button from './Button'
import { Notice } from './ui'

// Statuses where cancel / resume mean something: there is a live subscription to
// stop or restart.
const BILLABLE = ['trialing', 'active', 'past_due']

// Statuses where the coach has billing HISTORY, which outlives the
// subscription. A cancelled coach still owns their past invoices and is the
// person most likely to come looking for them at tax time, so the portal link
// survives the cancellation that takes the cancel button away.
const HAS_HISTORY = [...BILLABLE, 'canceled']

// Feather's credit-card glyph, for the failed-payment notice. Notice takes raw
// SVG children rather than an Icon name, like its three call sites on Dashboard.
const CARD_GLYPH = (
  <><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></>
)

function SubscriptionManager({ subscription, onChange }) {
  const [loading, setLoading] = useState(false)
  const [portalBusy, setPortalBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(false)

  const periodEndDate = subscription?.current_period_end || subscription?.trial_end
  const isCanceling = subscription?.cancel_at_period_end
  const isTrialing = subscription?.status === 'trialing'
  const isPastDue = subscription?.status === 'past_due'
  const canCancel = BILLABLE.includes(subscription?.status)
  const hasHistory = HAS_HISTORY.includes(subscription?.status)
  // Maps the stored cadence key to a display amount. Undefined for older rows
  // that predate billing_interval — the summary line just hides in that case.
  const planAmount = {
    monthly: '$49/month',
    '6mo': '$264 every 6 months',
    annual: '$490/year',
  }[subscription?.billing_interval]

  const asDate = (value) => new Date(value).toLocaleDateString()

  async function callManage(action) {
    setLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-subscription`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action }),
        }
      )
      const json = await res.json()

      if (json.ok) {
        setConfirming(false)
        if (onChange) onChange()
      } else {
        setError(json.error || 'Something went wrong.')
      }
    } catch {
      setError('Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  // Hands off to Stripe's hosted portal. `intent` is a LABEL the function
  // validates against its own allow-list; the return URL is decided server-side
  // and is never sent from here. 'payment_method' drops the coach straight into
  // the update-card flow, which is the whole point on a failed payment.
  async function openPortal(intent) {
    setPortalBusy(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-portal-session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ intent }),
        }
      )
      const json = await res.json()

      if (json.url) {
        // Leaving the page, so the busy state is deliberately NOT cleared: the
        // button must not go idle again under a navigation already in flight.
        window.location.href = json.url
        return
      }
      setError(json.error || 'Could not open the billing portal.')
    } catch {
      setError('Could not open the billing portal.')
    }
    setPortalBusy(false)
  }

  const portalButton = (
    <Button variant="muted" onClick={() => openPortal('portal')} loading={portalBusy}>
      Payment method and invoices
    </Button>
  )

  const errorLine = error && (
    <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-sm)', marginBottom: 8 }}>{error}</p>
  )

  // A failed payment leads the card, because it is the only state here with a
  // deadline attached: Stripe retries for a few days and then the subscription
  // is gone. Amber, not red, per B1 — this is recoverable by acting, and red in
  // this app means a CLIENT is in trouble. The update-card flow is the one
  // commit in this panel while it shows, so it takes the green (D3 rank 1) and
  // the portal link steps back to a plain link below.
  if (isPastDue) {
    return (
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
        <Notice
          tone="warning"
          icon={CARD_GLYPH}
          action={
            <Button variant="primary" onClick={() => openPortal('payment_method')} loading={portalBusy}>
              Update card
            </Button>
          }
        >
          Your last payment did not go through. Update your card to keep your account and your
          clients' access.
        </Notice>
        {errorLine}
        <div>
          <button
            onClick={() => openPortal('portal')}
            disabled={portalBusy}
            style={linkStyle}
          >
            Invoices and receipts
          </button>
        </div>
      </div>
    )
  }

  if (isCanceling) {
    return (
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
        <p style={{ color: 'var(--color-warning)', fontSize: 'var(--text-sm)', margin: 0 }}>
          Your plan will end on{' '}
          {periodEndDate ? asDate(periodEndDate) : 'the end of the current period'}.
          You'll keep access until then.
        </p>
        {errorLine}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-8)' }}>
          <Button variant="primary" onClick={() => callManage('resume')} loading={loading}>
            Resume subscription
          </Button>
          {portalButton}
        </div>
      </div>
    )
  }

  // Cancelled and done: nothing to cancel or resume, but the invoices remain.
  if (!canCancel) {
    return hasHistory ? (
      <div style={{ marginTop: 12 }}>
        {errorLine}
        {portalButton}
      </div>
    ) : null
  }

  return (
    <div style={{ marginTop: 12 }}>
      {errorLine}
      {/* The amount only. This line used to repeat the renewal date that the
          card already prints directly above it, which it got away with because
          `billing_interval` was never selected, so the whole line had been
          invisible since the column shipped. With it rendering, the date was
          on screen twice in four inches. */}
      {planAmount && (
        <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)', marginBottom: 8 }}>
          {isTrialing ? `Then ${planAmount}.` : `${planAmount}.`}
        </p>
      )}
      {confirming ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
            Cancel your subscription? You'll keep access until{' '}
            {periodEndDate ? asDate(periodEndDate) : 'the end of your current period'}.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="danger" onClick={() => callManage('cancel')} loading={loading}>
              Yes, cancel
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={loading}>
              Keep plan
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-12)' }}>
          {portalButton}
          <button onClick={() => setConfirming(true)} style={linkStyle}>
            Cancel subscription
          </button>
        </div>
      )}
    </div>
  )
}

// The type-only control already on this card, kept as one object now that two
// of them render side by side.
const linkStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--color-muted)',
  fontSize: 'var(--text-sm)',
  cursor: 'pointer',
  textDecoration: 'underline',
  padding: 0,
}

export default SubscriptionManager
