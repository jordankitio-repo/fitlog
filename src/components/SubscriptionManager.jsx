import { useState } from 'react'
import { supabase } from '../supabase'
import Button from './Button'
import { Notice, Pill } from './ui'
import { COACH_PLANS, planFor, isUpgrade } from '../utils/coachPlans'

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
  // The cadence the coach has picked but not yet confirmed, or null.
  const [pendingCadence, setPendingCadence] = useState(null)
  const [cadenceBusy, setCadenceBusy] = useState(false)

  const periodEndDate = subscription?.current_period_end || subscription?.trial_end
  const isCanceling = subscription?.cancel_at_period_end
  const isTrialing = subscription?.status === 'trialing'
  const isPastDue = subscription?.status === 'past_due'
  const canCancel = BILLABLE.includes(subscription?.status)
  const hasHistory = HAS_HISTORY.includes(subscription?.status)
  // Undefined for an older row that predates billing_interval, or one whose
  // price this deployment has no env for — the summary line just hides.
  const planAmount = planFor(subscription?.billing_interval)?.summary

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

  // Moves the coach up or down the ladder. Sends a cadence KEY; the Stripe
  // price is resolved server-side from it, never sent from here.
  async function changeCadence(cadence) {
    setCadenceBusy(true)
    setError(null)

    // One id per confirmed intention. If the response is what goes missing —
    // a dropped connection, a timeout — Stripe has already done the work, and
    // a second attempt carrying this same id replays the first answer instead
    // of invoicing the coach twice. A NEW decision gets a new id, so switching
    // annual to monthly and back again is two real changes, not a replay.
    const requestId = crypto.randomUUID()

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/change-cadence`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ cadence, requestId }),
        }
      )
      const json = await res.json()

      if (json.ok) {
        setPendingCadence(null)
        if (onChange) onChange()
      } else {
        setError(json.error || 'Could not change your plan.')
      }
    } catch {
      setError('Could not change your plan.')
    }
    setCadenceBusy(false)
  }

  const currentPlan = planFor(subscription?.billing_interval)
  const pendingPlan = planFor(pendingCadence)

  // The ladder. Pills, because 999px is this app's shape for a control you
  // press repeatedly and `Pill` is already muted-inactive / primary-selected.
  // Hidden entirely when the stored cadence is unrecognised: without knowing
  // where the coach IS, the strip cannot show a selected state, and a picker
  // with nothing selected invites a change that might be a no-op or a
  // downgrade.
  const cadencePicker = currentPlan && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
      <p style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--color-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        margin: 0,
      }}>
        Billing cadence
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-8)' }}>
        {COACH_PLANS.map((p) => {
          const selected = p.key === currentPlan.key
          return (
            <Pill
              key={p.key}
              active={selected}
              disabled={cadenceBusy}
              onClick={() => !selected && setPendingCadence(p.key)}
            >
              {p.name} · {p.amount}
            </Pill>
          )
        })}
      </div>
    </div>
  )

  // Changing cadence moves money today, in a direction that depends on which
  // way you went, so the confirm step says WHICH and WHY rather than "are you
  // sure". An upgrade takes the difference now; a downgrade hands unused time
  // back as credit, not cash, and saying so here is the difference between a
  // coach feeling billed and feeling robbed.
  const cadenceConfirm = pendingPlan && currentPlan && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
      <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)', margin: 0, lineHeight: 1.6 }}>
        Switch to {pendingPlan.name}, {pendingPlan.summary}?{' '}
        {isTrialing
          ? 'Nothing is charged while your trial runs. The new price applies when it ends.'
          : isUpgrade(currentPlan.key, pendingPlan.key)
            ? `You'll be charged the difference today, less the unused part of your ${currentPlan.name.toLowerCase()} plan.`
            : `The unused part of your ${currentPlan.name.toLowerCase()} plan becomes credit against your next invoices, so you keep what you've already paid for.`}
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-8)' }}>
        <Button variant="primary" onClick={() => changeCadence(pendingPlan.key)} loading={cadenceBusy}>
          Switch to {pendingPlan.name}
        </Button>
        <Button variant="ghost" onClick={() => setPendingCadence(null)} disabled={cadenceBusy}>
          Keep {currentPlan.name}
        </Button>
      </div>
    </div>
  )

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

  /* The picker's selected pill already reads "Monthly · $49", so this line only
     earns its place while the coach is NOT yet paying it: "then" is the one
     thing the pills cannot say. C6 — count how many times a number appears
     before adding a surface that shows it again. It also carries the whole fact
     when the picker is hidden, which is any row whose cadence we cannot
     resolve. */
  const amountLine = planAmount && (!cadencePicker || isTrialing) && (
    <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>
      {isTrialing ? `Then ${planAmount}.` : `${planAmount}.`}
    </p>
  )

  return (
    // --space-24 rather than 12 here, and the header block is only rendered
    // when it has something in it. Wrapping "nothing" in a div still makes it a
    // flex item, so the separation below the Status block was coming from a gap
    // either side of an empty element: correct by accident, and silently wrong
    // the moment anything moved. A3 wants ≥24 between groups, so it says 24.
    <div style={{ marginTop: 'var(--space-24)', display: 'flex', flexDirection: 'column', gap: 'var(--space-24)' }}>
      {(errorLine || amountLine) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
          {errorLine}
          {amountLine}
        </div>
      )}

      {/* One decision on screen at a time. Cancelling outranks a cadence
          change, and a cadence change outranks the idle picker it came from —
          otherwise the coach is asked to confirm a switch while the controls
          that started it are still live behind the question. */}
      {confirming ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
          <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>
            Cancel your subscription? You'll keep access until{' '}
            {periodEndDate ? asDate(periodEndDate) : 'the end of your current period'}.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-8)' }}>
            <Button variant="danger" onClick={() => callManage('cancel')} loading={loading}>
              Yes, cancel
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={loading}>
              Keep plan
            </Button>
          </div>
        </div>
      ) : pendingCadence ? (
        cadenceConfirm
      ) : (
        <>
          {cadencePicker}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-12)' }}>
            {portalButton}
            <button onClick={() => setConfirming(true)} style={linkStyle}>
              Cancel subscription
            </button>
          </div>
        </>
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
