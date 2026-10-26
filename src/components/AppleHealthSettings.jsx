import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from './Button'
import { SettingRow } from './ui'
import { relativeTime } from '../utils/relativeTime'
import { isNativeApp } from '../utils/platform'
import { connectAppleHealth, disconnectAppleHealth, syncAppleHealth } from '../utils/healthSync'

const muted = { fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: 0, lineHeight: 1.6 }
const errorText = { fontSize: 'var(--text-sm)', color: 'var(--color-error)', margin: 0 }
const divider = { height: '1px', backgroundColor: 'var(--color-border)' }
// The sign-up age gate's checkbox, at reading size: these are the two
// sentences being agreed to, not small print under a form.
const consentRow = {
  display: 'flex', alignItems: 'flex-start', gap: 'var(--space-8)',
  fontSize: 'var(--text-base)', color: 'var(--color-text)', lineHeight: 1.5, cursor: 'pointer',
}
const box = { marginTop: '3px', flex: '0 0 auto', cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--color-primary)' }

const ERRORS = {
  consent_required: 'Tick both boxes to connect.',
  consent_withdrawn: 'Your consent was withdrawn. Disconnect and connect again to resume.',
  not_connected: 'Apple Health is not connected any more.',
  unavailable: 'Apple Health is not available on this device.',
}
const messageFor = (err) => ERRORS[err?.code] || 'Something went wrong. Try again.'

// What the connection is doing, in a sentence. Graded like every other status
// in the app (B1): amber only when it needs the reader, grey otherwise.
function statusLine(connection) {
  if (connection.status === 'error' || connection.status === 'reauth_required') {
    return { text: 'Sync is failing. Try Sync now.', tone: 'var(--color-warning)' }
  }
  if (connection.backfill_pending) return { text: 'Importing your last year.', tone: null }
  if (connection.last_synced_at) return { text: `Synced ${relativeTime(connection.last_synced_at)}`, tone: null }
  return { text: 'Waiting for the first sync.', tone: null }
}

// Settings > Apple Health. Connect is phone-only, because the phone is where
// Health lives; status and disconnect also render on the web, so a client can
// stop sharing from whichever screen they are on.
//
// The two consents are SEPARATE boxes, unticked, and both required. That is
// the law's shape, not a design choice (WA MHMDA: collection and sharing are
// separately affirmed, never pre-checked, never bundled), and the server
// refuses a connect without both, so this cannot drift into a single box.
export default function AppleHealthSettings({ userId, connection, onChange }) {
  const native = isNativeApp()
  const [collect, setCollect] = useState(false)
  const [share, setShare] = useState(false)
  const [busy, setBusy] = useState(null) // 'connect' | 'sync' | 'disconnect'
  const [error, setError] = useState('')
  const [stage, setStage] = useState('idle') // disconnect: 'idle' | 'confirm'
  const [purge, setPurge] = useState(false)

  async function run(kind, fn) {
    setBusy(kind)
    setError('')
    try {
      await fn()
      await onChange()
    } catch (err) {
      console.error(`Apple Health ${kind} failed:`, err)
      setError(messageFor(err))
    } finally {
      setBusy(null)
    }
  }

  const connect = () => run('connect', async () => {
    await connectAppleHealth()
    // The first sync is the backfill, and it is what the reader is waiting
    // for, so it starts now rather than on the next app open.
    syncAppleHealth(userId, { force: true }).then(onChange).catch(err => {
      console.error('Apple Health first sync failed:', err)
      onChange()
    })
  })
  const syncNow = () => run('sync', () => syncAppleHealth(userId, { force: true }))
  const disconnect = () => run('disconnect', async () => {
    await disconnectAppleHealth({ purge })
    setStage('idle')
    setPurge(false)
  })

  if (!connection) {
    return (
      <>
        <p style={muted}>
          Bring your steps, weigh-ins and workouts in from Apple Health instead of typing them. The only
          thing Gardnr adds to Health is a weigh-in you type here, so your weight history is whole there too.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
          <label style={consentRow}>
            <input type="checkbox" checked={collect} onChange={e => setCollect(e.target.checked)} style={box} />
            <span>I agree to Gardnr collecting my steps, weight and workouts from Apple Health.</span>
          </label>
          <label style={consentRow}>
            <input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} style={box} />
            <span>I agree to my coach, now or in future, seeing this data.</span>
          </label>
        </div>
        <p style={muted}>
          You can disconnect at any time. See the{' '}
          <Link to="/health-data-privacy" style={{ color: 'var(--color-primary)' }}>Consumer Health Data Policy</Link>.
        </p>
        {error && <p style={errorText}>{error}</p>}
        <div>
          <Button variant="primary" onClick={connect} loading={busy === 'connect'} disabled={!collect || !share}>
            Connect Apple Health
          </Button>
        </div>
      </>
    )
  }

  const status = statusLine(connection)
  return (
    <>
      <SettingRow
        label="Apple Health"
        description={
          <>
            <span style={status.tone ? { color: status.tone, fontWeight: 'var(--weight-semibold)' } : undefined}>
              {status.text}
            </span>
            <br />
            {native
              ? 'Steps, weigh-ins and workouts. A number you edit or delete here stays the way you left it.'
              : 'Syncs from the Gardnr app on your iPhone.'}
          </>
        }
      >
        {native && (
          <Button variant="muted" onClick={syncNow} loading={busy === 'sync'}>Sync now</Button>
        )}
      </SettingRow>
      {native && (
        <p style={muted}>
          Nothing showing up? Check Settings › Health › Data Access & Devices › Gardnr.
        </p>
      )}
      {error && <p style={errorText}>{error}</p>}

      <div style={divider} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
        <SettingRow
          label="Disconnect"
          tone="danger"
          description="Stops syncing and withdraws both consents. What was already imported stays unless you choose to delete it."
        >
          {stage === 'idle' && (
            <Button variant="danger" onClick={() => { setStage('confirm'); setError('') }}>Disconnect</Button>
          )}
        </SettingRow>
        {stage === 'confirm' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
            <label style={consentRow}>
              <input type="checkbox" checked={purge} onChange={e => setPurge(e.target.checked)} style={box} />
              <span>Also delete everything imported from Apple Health. Numbers you typed or edited yourself are kept.</span>
            </label>
            <div style={{ display: 'flex', gap: 'var(--space-12)' }}>
              <Button variant="danger-solid" onClick={disconnect} loading={busy === 'disconnect'}>
                {purge ? 'Disconnect and delete' : 'Disconnect'}
              </Button>
              <Button variant="ghost" onClick={() => { setStage('idle'); setPurge(false) }}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
