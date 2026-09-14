import { useState } from 'react'
import { supabase } from '../supabase'
import Button from './Button'

function SubscriptionManager({ subscription, onChange }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(false)

  const periodEndDate = subscription?.current_period_end || subscription?.trial_end
  const isCanceling = subscription?.cancel_at_period_end
  const isTrialing = subscription?.status === 'trialing'
  // Maps the stored cadence key to a display amount. Undefined for older rows
  // that predate billing_interval — the summary line just hides in that case.
  const planAmount = {
    monthly: '$49/month',
    '6mo': '$264 every 6 months',
    annual: '$490/year',
  }[subscription?.billing_interval]

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

  if (isCanceling) {
    return (
      <div style={{ marginTop: 12 }}>
        <p style={{ color: 'var(--color-warning)', fontSize: 'var(--text-sm)', marginBottom: 8 }}>
          Your plan will end on{' '}
          {periodEndDate ? new Date(periodEndDate).toLocaleDateString() : 'the end of the current period'}.
          You'll keep access until then.
        </p>
        {error && <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-sm)', marginBottom: 8 }}>{error}</p>}
        <Button variant="primary" onClick={() => callManage('resume')} loading={loading}>
          Resume subscription
        </Button>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 12 }}>
      {error && <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-sm)', marginBottom: 8 }}>{error}</p>}
      {planAmount && (
        <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)', marginBottom: 8 }}>
          {isTrialing
            ? `Free trial — then ${planAmount}${periodEndDate ? ` on ${new Date(periodEndDate).toLocaleDateString()}` : ''}.`
            : `${planAmount}${periodEndDate ? ` · renews ${new Date(periodEndDate).toLocaleDateString()}` : ''}.`}
        </p>
      )}
      {confirming ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
            Cancel your subscription? You'll keep access until{' '}
            {periodEndDate ? new Date(periodEndDate).toLocaleDateString() : 'the end of your current period'}.
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
        <button
          onClick={() => setConfirming(true)}
          style={{ background: 'none', border: 'none', color: 'var(--color-muted)', fontSize: 'var(--text-sm)', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
        >
          Cancel subscription
        </button>
      )}
    </div>
  )
}

export default SubscriptionManager
