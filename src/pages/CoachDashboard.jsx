import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import Toast from '../components/Toast'
import InfoTip from '../components/InfoTip'
import { computeClientStats } from '../utils/clientStats'
import { getInviteBlockReason } from '../utils/inviteValidation'
import { attentionLevel, compareByAttention } from '../utils/attentionLevel'
import { nudgeReason } from '../utils/nudgeReason'
import { cardStyle } from '../utils/styles'

const attentionColors = { red: '#f87171', yellow: '#fbbf24', green: '#34d399' }

// Summary-card styles. The label reserves a fixed two-line height so the big
// numbers line up across all three cards even when a label wraps.
const summaryLabelStyle = {
  fontSize: 'var(--text-xs)', color: 'var(--color-muted)', textTransform: 'uppercase',
  letterSpacing: '0.08em', fontWeight: 600, margin: 0, textAlign: 'center',
  lineHeight: 1.3, minHeight: '2.6em', display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const summaryNumStyle = { fontSize: '2rem', fontWeight: 700, margin: 0, lineHeight: 1 }

function scoreClient(s) {
  if (!s) return -1
  return s.complianceItems
    .filter(i => i.hasData)
    .reduce((sum, i) => sum + i.value, 0)
}

function CoachDashboard({ profile }) {
  const [clients, setClients] = useState([])
  const [clientStats, setClientStats] = useState({})
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [soloAccountDetected, setSoloAccountDetected] = useState(false)
  const [pendingInviteEmail, setPendingInviteEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [nudgeLoadingIds, setNudgeLoadingIds] = useState({})
  const [toast, setToast] = useState({ message: '', type: 'success' })
  const [sortBy, setSortBy] = useState('attention')
  const navigate = useNavigate()

  useEffect(() => {
    fetchClients()
  }, [])

  async function fetchClients() {
    setLoading(true)

    const { data: relationships, error } = await supabase
      .from('coach_clients')
      .select('id, coach_id, client_id, status, created_at, lock_cleared_at, last_nudged_at')
      .eq('coach_id', profile.id)
      .eq('status', 'active')

    if (error) { console.error(error); setLoading(false); return }
    if (!relationships.length) { setClients([]); setLoading(false); return }

    const clientIds = relationships.map(r => r.client_id)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', clientIds)

    const merged = relationships.map(r => ({
      ...r,
      client: profiles.find(p => p.id === r.client_id)
    }))

    setClients(merged)
    await fetchAllClientStats(clientIds, relationships)
    setLoading(false)
  }

  async function fetchAllClientStats(clientIds, relationships = []) {
    const stats = await computeClientStats(clientIds, relationships)
    setClientStats(stats)
  }

  function logLabel(days) {
    if (days === null) return 'Never logged'
    if (days === 0) return 'Logged today'
    if (days === 1) return 'Logged yesterday'
    return `${days} days ago`
  }

  function showToast(message, type = 'success') {
    setToast({ message, type })
  }

  async function nudgeClient(client, nudge) {
    setNudgeLoadingIds(prev => ({ ...prev, [client.client_id]: true }))

    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch(
      'https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/nudge-client',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ clientId: client.client_id, reason: nudge?.key, days: nudge?.days ?? null }),
      }
    )
    const data = await response.json()

    if (data.error === 'too_soon') {
      showToast(`You nudged ${client.client?.full_name || 'this client'} recently. Wait 48 hours before nudging again.`, 'error')
    } else if (data.error) {
      showToast('Could not send nudge. Try again.', 'error')
    } else {
      showToast(`Nudge sent to ${client.client?.full_name || 'client'}.`, 'success')
    }

    setNudgeLoadingIds(prev => ({ ...prev, [client.client_id]: false }))
  }

  async function checkAndInvite() {
    const normalizedEmail = inviteEmail.trim().toLowerCase()
    if (!normalizedEmail) return
    setInviteLink('')
    setInviteError('')
    setSoloAccountDetected(false)
    setPendingInviteEmail('')

    // Check if the email already has an account via a SECURITY DEFINER RPC —
    // profiles RLS hides other users' rows from the coach, so a direct read
    // always returned null and existing-account states never fired.
    const { data: lookupRows } = await supabase.rpc('invite_email_status', { p_email: normalizedEmail })
    const existing = (Array.isArray(lookupRows) ? lookupRows[0] : null) || null

    let existingRelation = null
    if (existing?.role === 'client') {
      const { data } = await supabase
        .from('coach_clients')
        .select('id')
        .eq('coach_id', profile.id)
        .eq('client_id', existing.id)
        .eq('status', 'active')
        .maybeSingle()
      existingRelation = data
    }

    const { data: pendingInvite } = await supabase
      .from('invitations')
      .select('id')
      .eq('coach_id', profile.id)
      .eq('client_email', normalizedEmail)
      .eq('status', 'pending')
      .maybeSingle()

    const blockReason = getInviteBlockReason(existing, existingRelation, pendingInvite)

    switch (blockReason) {
      case 'coach':
        setInviteError('This email belongs to a coach account and cannot be invited as a client.')
        setInviteLink('')
        return
      case 'already-your-client':
        setInviteError('This person is already your client.')
        setInviteLink('')
        return
      case 'client-of-another':
        setInviteError('This person is already connected to another coach.')
        setInviteLink('')
        return
      case 'duplicate-pending':
        setInviteError('You already sent an invite to this email.')
        setInviteLink('')
        return
      case 'existing-solo':
        setPendingInviteEmail(normalizedEmail)
        setSoloAccountDetected(true)
        return
      default:
        break
    }

    // No blocking account state - send invite
    await sendInvite(normalizedEmail)
  }

  async function sendInvite(email, accountExists = false) {
    const { data, error } = await supabase
      .from('invitations')
      .insert([{ coach_id: profile.id, client_email: email, account_exists: accountExists }])
      .select().single()
    if (error) {
      setInviteError('Error sending invite.')
      setInviteLink('')
      console.error(error)
    }
    else {
      setInviteLink(`${window.location.origin}/join?token=${data.token}`)
      setInviteError('')
      setInviteEmail('')
      setSoloAccountDetected(false)
      setPendingInviteEmail('')
    }
  }

  const needsAttention = clients.filter(c =>
    attentionLevel(clientStats[c.client_id]).level === 'red'
  ).length

  const metricColors = {
    Calories: '#22c55e',
    Protein: '#f87171',
    Cardio: '#3b82f6',
    Steps: '#a855f7',
  }

  const sortedClients = [...clients].sort((a, b) => {
    const sa = clientStats[a.client_id]
    const sb = clientStats[b.client_id]

    if (sortBy === 'attention') {
      const diff = compareByAttention(sa, sb)
      if (diff !== 0) return diff
      return (sa?.daysSinceLog ?? 999) - (sb?.daysSinceLog ?? 999)
    }

    if (sortBy === 'compliance') {
      const diff = scoreClient(sb) - scoreClient(sa)
      if (diff !== 0) return diff
      const da = sa?.daysSinceLog ?? 999
      const db = sb?.daysSinceLog ?? 999
      return da - db
    }

    if (sortBy === 'recent') {
      const da = sa?.daysSinceLog ?? 999
      const db = sb?.daysSinceLog ?? 999
      return da - db
    }

    if (sortBy === 'checkin') {
      const ca = sa?.checkIn ? 1 : 0
      const cb = sb?.checkIn ? 1 : 0
      return cb - ca
    }

    return 0
  })

  return (
    <div className="page-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1>Coach Dashboard</h1>
        <p style={{ marginTop: '4px', color: 'var(--color-muted)' }}>Welcome, {profile.full_name}</p>
      </div>

      {/* Summary bar */}
      {clients.length > 0 && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <div style={{ ...cardStyle, padding: '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <p style={summaryLabelStyle}>Total clients</p>
            <p style={summaryNumStyle}>{clients.length}</p>
          </div>
          <div style={{ ...cardStyle, padding: '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <p style={summaryLabelStyle}>Checked in this week</p>
            <p style={{ ...summaryNumStyle, color: '#34d399' }}>
              {clients.filter(c => clientStats[c.client_id]?.checkIn).length}
              <span style={{ fontSize: '0.875rem', color: 'var(--color-muted)', fontWeight: 400 }}>/{clients.length}</span>
            </p>
          </div>
          <div style={{ ...cardStyle, border: `1px solid ${needsAttention > 0 ? '#f87171' : 'var(--color-border)'}`, padding: '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <p style={summaryLabelStyle}>Need attention</p>
            <p style={{ ...summaryNumStyle, color: needsAttention > 0 ? '#f87171' : '#34d399' }}>{needsAttention}</p>
          </div>
        </div>
      )}

      {/* Client list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {loading ? (
          <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>Loading...</p>
        ) : clients.length === 0 ? (
          <EmptyState
            icon={null}
            title="No clients yet"
            description="Send an invite below to add your first client."
          />
        ) : (
          <>
            {clients.length > 1 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', alignSelf: 'center', marginRight: 4 }}>
                  Sort:
                </p>
                {[
                  { key: 'attention', label: 'Attention' },
                  { key: 'compliance', label: 'Compliance' },
                  { key: 'recent', label: 'Last logged' },
                  { key: 'checkin', label: 'Check-in' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setSortBy(key)}
                    style={{
                      background: sortBy === key ? 'var(--color-primary)' : 'var(--color-surface)',
                      color: sortBy === key ? '#fff' : 'var(--color-muted)',
                      border: `1px solid ${sortBy === key ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      borderRadius: 'var(--radius)',
                      padding: '4px 12px',
                      fontSize: 'var(--text-xs)',
                      cursor: 'pointer',
                      fontWeight: sortBy === key ? 600 : 400,
                    }}
                  >
                    {label}
                  </button>
                ))}
                <span style={{ marginLeft: 'auto', alignSelf: 'center', display: 'inline-flex', alignItems: 'center' }}>
                  <InfoTip text="Status pill = the most pressing reason a client needs you (no check-in, or days without a log); green means on track. Compliance pills = days on target out of 7 per metric — dimmer means fewer." />
                </span>
              </div>
            )}
            {sortedClients.map((c) => {
              const s = clientStats[c.client_id]
              const triage = attentionLevel(s)
              const hasAlert = triage.level === 'red'
              const nudge = nudgeReason({ daysSinceLog: s?.daysSinceLog, hasCheckIn: !!s?.checkIn })
              return (
                <div key={c.id} style={{
                  ...cardStyle,
                  border: `1px solid ${hasAlert ? '#f87171' : 'var(--color-border)'}`,
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 'var(--text-md)' }}>{c.client?.full_name || 'Unnamed'}</p>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: '2px', letterSpacing: '0.01em' }}>{c.client?.email}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {nudge && (
                      <Button
                        onClick={() => nudgeClient(c, nudge)}
                        variant="ghost"
                        size="sm"
                        loading={Boolean(nudgeLoadingIds[c.client_id])}
                        title={nudge.key === 'checkin' ? 'Nudge them to do this week’s check-in' : 'Nudge them to log — they’ve gone quiet'}
                        style={{ border: '1px solid var(--color-control-border)', padding: '5px 10px' }}
                      >
                        Nudge
                      </Button>
                    )}
                    <Button
                      onClick={() => navigate(`/client/${c.client_id}`)}
                      variant="ghost"
                      size="sm"
                      style={{ border: '1px solid var(--color-control-border)', padding: '5px 10px' }}
                    >
                      View data →
                    </Button>
                  </div>
                </div>

                {/* Stats row */}
                {s && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Attention triage — owns overall status; the pills below are supporting evidence */}
                    <span
                      title={triage.reasons.length ? triage.reasons.join(' · ') : logLabel(s.daysSinceLog)}
                      style={{
                        fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px',
                        borderRadius: '999px',
                        backgroundColor: triage.level === 'green' ? 'var(--color-bg)' : `${attentionColors[triage.level]}26`,
                        border: `1px solid ${attentionColors[triage.level]}`,
                        color: attentionColors[triage.level],
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '999px', backgroundColor: attentionColors[triage.level] }} />
                      {triage.level === 'green' ? logLabel(s.daysSinceLog) : triage.reasons[0]}
                    </span>

                    {/* Check-in (positive only — a missing check-in surfaces via the triage badge) */}
                    {s.checkIn && (
                      <span
                        title={`Check-in: ${s.checkIn.adherence_rating}/10 adherence · ${s.checkIn.energy_level}/10 energy`}
                        style={{
                          fontSize: '0.75rem', fontWeight: 600, padding: '3px 10px',
                          borderRadius: '999px', backgroundColor: 'var(--color-bg)',
                          border: '1px solid #34d399', color: '#34d399'
                        }}
                      >
                        {s.checkIn.adherence_rating}/10 adherence · {s.checkIn.energy_level}/10 energy
                      </span>
                    )}
                  </div>
                )}

                {/* Obstacles preview */}
                {s?.checkIn?.obstacles && (
                  <div style={{ paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: '4px' }}>Obstacles</p>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>{s.checkIn.obstacles}</p>
                  </div>
                )}

                {/* 7-day compliance pills */}
                {(s?.complianceItems?.some(i => i.logged > 0) || s?.lockInfo?.locked) && (
                  <div style={{ paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
                    <p style={{ fontSize: '0.65rem', color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                      7-day compliance
                    </p>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {s.lockInfo?.locked && (
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px',
                          borderRadius: '999px', backgroundColor: 'var(--color-bg)',
                          border: '1px solid #f87171', color: '#f87171'
                        }}>
                          Locked
                        </span>
                      )}
                      {s.complianceItems.map(({ label, value, logged }) => {
                        if (logged === 0) return null
                        const metricColor = metricColors[label] || 'var(--color-muted)'
                        const opacity = value >= 5 ? 1 : value >= 3 ? 0.75 : 0.55
                        return (
                          <span key={label} style={{
                            fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px',
                            borderRadius: '999px',
                            backgroundColor: value < 3 ? `${metricColor}26` : 'var(--color-bg)',
                            border: `1px solid ${metricColor}`,
                            color: metricColor,
                            opacity,
                          }}>
                            {label} {value}/7
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })
          }
          </>
        )}
      </div>

      {/* Invite section */}
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h2>Invite a client</h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="email"
            placeholder="Client email"
            value={inviteEmail}
	            onChange={(e) => {
	              setInviteEmail(e.target.value)
	              setInviteError('')
	              setInviteLink('')
	            }}
	            style={{ flex: 1, backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 14px', color: 'var(--color-text)', fontSize: '1rem' }}
	          />
	          <Button onClick={checkAndInvite} variant="primary">Send invite</Button>
	        </div>
	        {soloAccountDetected && (
	          <div style={{
	            padding: '14px 16px',
	            border: '1px solid var(--color-border)',
	            borderRadius: 'var(--radius)',
	            backgroundColor: 'var(--color-bg)',
	            display: 'flex',
	            flexDirection: 'column',
	            gap: '10px'
	          }}>
	            <p style={{ fontSize: '0.875rem', margin: 0 }}>
	              <strong>{pendingInviteEmail}</strong> already has a Gardnr account. Send them an invite to connect as your client? Their existing data will be preserved.
	            </p>
	            <div style={{ display: 'flex', gap: '8px' }}>
	              <Button
	                onClick={() => sendInvite(pendingInviteEmail, true)}
	                variant="primary"
	                size="sm"
	              >
	                Send invite anyway
	              </Button>
	              <Button
	                onClick={() => { setSoloAccountDetected(false); setPendingInviteEmail('') }}
	                variant="ghost"
	                size="sm"
	              >
	                Cancel
	              </Button>
	            </div>
	          </div>
	        )}
	        {inviteError && (
          <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{inviteError}</p>
        )}
        {inviteLink && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', wordBreak: 'break-all' }}>{inviteLink}</p>
            <button
              onClick={() => navigator.clipboard.writeText(inviteLink)}
              style={{ backgroundColor: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--color-text)', whiteSpace: 'nowrap' }}
            >
              Copy
            </button>
          </div>
        )}
      </div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
    </div>
  )
}

export default CoachDashboard
