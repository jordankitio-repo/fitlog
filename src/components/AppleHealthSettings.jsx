import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from './Button'
import { Checkbox, SettingRow, Toggle } from './ui'
import { relativeTime } from '../utils/relativeTime'
import appleHealthIcon from '../assets/apple-health-icon.png'
import { isNativeApp } from '../utils/platform'
import {
  CONSENT_TEXT, connectAppleHealth, disconnectAppleHealth, healthWriteStatus,
  savesWeighInsToHealth, setSavesWeighInsToHealth, syncAppleHealth,
} from '../utils/healthSync'

const muted = { fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: 0, lineHeight: 1.6 }
const errorText = { fontSize: 'var(--text-sm)', color: 'var(--color-error)', margin: 0 }
const divider = { height: '1px', backgroundColor: 'var(--color-border)' }
// Two standing facts about the sync, set as quiet notes under its row rather
// than a paragraph of their own between two controls.
const notes = {
  margin: 0, paddingLeft: 'var(--space-16)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
  fontSize: 'var(--text-sm)', color: 'var(--color-muted)', lineHeight: 1.5,
}
// Where a client changes what Gardnr may do in Health, per Apple's own guide.
const HEALTH_APPS_PATH = 'In the Health app, tap your profile picture, then Apps › Gardnr.'

const ERRORS = {
  consent_required: 'Tick both boxes to connect.',
  consent_withdrawn: 'Your consent was withdrawn. Disconnect and connect again to resume.',
  not_connected: 'Apple Health is not connected any more.',
  unavailable: 'Apple Health is not available on this device.',
}
const messageFor = (err) => ERRORS[err?.code] || 'Something went wrong. Try again.'

// What the connection is doing, in a sentence. Graded like every other status
// in the app (B1): amber only when it needs the reader, grey otherwise.
// The fix it names has to exist where it is read: Sync now is on the phone
// only, so the web points at the phone instead.
function statusLine(connection, native) {
  if (connection.status === 'error' || connection.status === 'reauth_required') {
    return {
      text: native ? 'Last sync failed. Try Sync now.' : 'Last sync failed. Open Gardnr on your iPhone to retry.',
      tone: 'var(--color-warning)',
    }
  }
  if (connection.backfill_pending) return { text: 'Importing your history…', tone: null }
  if (connection.last_synced_at) return { text: `Last synced ${relativeTime(connection.last_synced_at)}`, tone: null }
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
  const [saveWeighIns, setSaveWeighIns] = useState(savesWeighInsToHealth)
  // Whether iOS lets Gardnr write at all. Read once the connection is up, so
  // the switch never offers something the phone has already turned off.
  const [writeStatus, setWriteStatus] = useState(null)
  useEffect(() => {
    if (!connection || !native) return
    healthWriteStatus().then(setWriteStatus)
  }, [connection, native])

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
        {/* Apple's own Health icon, as Apple supplies it (Apple Design
            Resources): its shape is in the artwork, so no mask, border or
            effect is added, and it is only resized. Apple's rules for using it
            in an app, all kept here: the name "Apple Health" sits beside it,
            it is not a button, and it marks compatibility, nothing more. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)' }}>
          <img src={appleHealthIcon} alt="" width={48} height={48} style={{ flex: '0 0 auto', display: 'block' }} />
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 'var(--weight-medium)', color: 'var(--color-text)' }}>
              Apple Health
            </p>
            <p style={muted}>Your steps, weigh-ins and workouts sync from Apple Health automatically.</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* The sentences come from CONSENT_TEXT, the same strings connect
              stores against the grant, so the record says what the box said. */}
          <Checkbox checked={collect} onChange={setCollect}>{CONSENT_TEXT.collect}</Checkbox>
          <Checkbox checked={share} onChange={setShare}>{CONSENT_TEXT.shareCoach}</Checkbox>
        </div>
        <p style={muted}>
          You can disconnect at any time. Read how we handle health data in our{' '}
          <Link to="/health-data-privacy" style={{ color: 'var(--color-primary)' }}>Consumer Health Data Policy</Link>.
        </p>
        {error && <p style={errorText}>{error}</p>}
        <div>
          <Button variant="primary" onClick={connect} loading={busy === 'connect'} disabled={!collect || !share}>
            Connect to Apple Health
          </Button>
        </div>
      </>
    )
  }

  const status = statusLine(connection, native)
  return (
    <>
      {/* The STATUS is the row's headline, because it is the one thing that
          changes and the one thing a reader opens this screen to check. The
          page title already says Apple Health, so the row does not say it
          again. Sync now sits beside it at every width: it is short, and a
          button stacked under a paragraph read as an afterthought. */}
      <SettingRow
        keepInline
        label={<span style={status.tone ? { color: status.tone, fontWeight: 'var(--weight-semibold)' } : undefined}>{status.text}</span>}
        description={native
          ? 'Steps, weigh-ins and workouts.'
          : 'Steps, weigh-ins and workouts, synced from your iPhone.'}
      >
        {native && (
          <Button variant="muted" size="sm" onClick={syncNow} loading={busy === 'sync'}>Sync now</Button>
        )}
      </SettingRow>
      {native && (
        <ul style={notes}>
          <li>Anything you edit or delete in Gardnr stays the way you left it.</li>
          <li>Missing data? {HEALTH_APPS_PATH}</li>
        </ul>
      )}
      {error && <p style={errorText}>{error}</p>}

      {/* The one direction Gardnr writes, and the client's switch for it. When
          iOS has turned writing off, the switch says so and how to undo it,
          rather than offering a choice the phone will not honour. */}
      {native && (
        <>
          <div style={divider} />
          <Toggle
            label="Save weigh-ins to Apple Health"
            description={writeStatus === 'off'
              ? `Turned off for Gardnr in Apple Health. ${HEALTH_APPS_PATH}`
              : 'Weigh-ins you type here are added to Apple Health.'}
            checked={writeStatus !== 'off' && saveWeighIns}
            disabled={writeStatus === 'off'}
            onChange={() => { setSavesWeighInsToHealth(!saveWeighIns); setSaveWeighIns(!saveWeighIns) }}
          />
        </>
      )}

      <div style={divider} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
        {/* A plain label and a `danger` button, not a red label above a
            button saying the same word: the red arrives on the button when it
            is pressed (D3), and the screen does not stand in red at rest. */}
        <SettingRow
          keepInline
          label="Stop syncing"
          description="Your imported history stays unless you choose to delete it."
        >
          {stage === 'idle' && (
            <Button variant="danger" size="sm" onClick={() => { setStage('confirm'); setError('') }}>Disconnect</Button>
          )}
        </SettingRow>
        {stage === 'confirm' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
            <Checkbox checked={purge} onChange={setPurge}>
              Also delete the data imported from Apple Health. Entries you typed or edited are kept.
            </Checkbox>
            <div style={{ display: 'flex', gap: 'var(--space-12)' }}>
              <Button variant="danger-solid" size="sm" onClick={disconnect} loading={busy === 'disconnect'}>
                {purge ? 'Disconnect and delete' : 'Disconnect'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setStage('idle'); setPurge(false) }}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
