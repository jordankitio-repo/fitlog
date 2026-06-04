import Button from '../components/Button'

function BillingSuccess() {
  return (
    <div style={{ maxWidth: '400px', margin: '80px auto', display: 'flex', flexDirection: 'column', gap: '24px', padding: '0 16px', textAlign: 'center' }}>
      <div>
        <p style={{ fontSize: '2rem', marginBottom: '8px' }}>✓</p>
        <h1>You're all set</h1>
        <p style={{ color: 'var(--color-muted)', marginTop: '8px' }}>
          Your 30-day free trial has started. You won't be charged until the trial ends.
        </p>
      </div>
      <Button onClick={() => window.location.href = '/'} variant="primary" fullWidth>
        Go to dashboard
      </Button>
    </div>
  )
}

export default BillingSuccess
