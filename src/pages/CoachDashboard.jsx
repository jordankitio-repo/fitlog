import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import Toast from '../components/Toast'
import Skeleton from '../components/Skeleton'
import InfoTip from '../components/InfoTip'
import { computeClientStats } from '../utils/clientStats'
import { getInviteBlockReason } from '../utils/inviteValidation'
import { attentionLevel, compareByAttention, summarizeRoster } from '../utils/attentionLevel'
import { nudgeReason } from '../utils/nudgeReason'
import { cardStyle } from '../utils/styles'

const attentionColors = { red: 'var(--color-error)', yellow: 'var(--color-warning)', green: 'var(--color-success)' }

// Summary-card styles. The label reserves a fixed two-line height so the big
// numbers line up across all three cards even when a label wraps.
const summaryLabelStyle = {
  fontSize: 'var(--text-xs)', color: 'var(--color-muted)', textTransform: 'uppercase',
  letterSpacing: '0.08em', fontWeight: 600, margin: 0, textAlign: 'center',
  lineHeight: 1.3, minHeight: '2.6em', display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const summaryNumStyle = { fontSize: '2rem', fontWeight: 700, margin: 0, lineHeight: 1 }

// Portfolio triage headline — "who needs attention today" across the whole
// roster (the "100 clients with the attention of 20" view). Counts come from
// summarizeRoster, which is built on the same attentionLevel the per-client
// badges use, so the banner and the badges can never disagree.
function RosterBanner({ roster, onReviewClick }) {
  const [reviewHover, setReviewHover] = useState(false)
  const seg = (color, n, label) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <span style={{ fontWeight: 700 }}>{n}</span>
      <span style={{ color: 'var(--color-muted)', fontSize: 'var(--text-xs)' }}>{label}</span>
    </span>
  )
  return (
    <div style={{ ...cardStyle, padding: '14px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '18px' }}>
      <span style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', fontWeight: 600 }}>
        Roster
      </span>
      {seg(attentionColors.red, roster.atRisk, 'at risk')}
      {seg(attentionColors.yellow, roster.review, 'needs review')}
      {seg(attentionColors.green, roster.onTrack, 'on track')}
      <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '14px', flexWrap: 'wrap' }}>
        {roster.checkInsToReview > 0 && (
          <button
            onClick={onReviewClick}
            disabled={!onReviewClick}
            onMouseEnter={() => setReviewHover(true)}
            onMouseLeave={() => setReviewHover(false)}
            title="Review the oldest waiting check-in"
            style={{
              fontFamily: 'inherit', fontSize: 'var(--text-xs)', fontWeight: 700,
              color: reviewHover ? 'var(--color-on-accent)' : 'var(--color-primary)',
              background: reviewHover ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-primary) 35%, transparent)',
              borderRadius: '999px', padding: '5px 12px',
              cursor: onReviewClick ? 'pointer' : 'default',
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              transition: 'background 120ms, color 120ms',
            }}
          >
            {roster.checkInsToReview} check-in{roster.checkInsToReview === 1 ? '' : 's'} to review
            <span aria-hidden="true" style={{ transform: reviewHover ? 'translateX(2px)' : 'none', transition: 'transform 120ms' }}>→</span>
          </button>
        )}
        {roster.noTargets > 0 && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
            {roster.noTargets} need targets set
          </span>
        )}
      </span>
    </div>
  )
}

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
  const [inviteEmailedTo, setInviteEmailedTo] = useState('') // address the invite email reached, or ''
  const inviteInputRef = useRef(null)
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
      .select('id, coach_id, client_id, status, created_at, lock_cleared_at, last_nudged_at, checkin_interval_weeks')
      .eq('coach_id', profile.id)
      .eq('status', 'active')

    if (error) { console.error(error); setLoading(false); return }
    if (!relationships.length) { setClients([]); setLoading(false); return }

    const clientIds = relationships.map(r => r.client_id)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url')
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

  // Jump the new coach straight to the invite field from the empty-roster CTA.
  function focusInvite() {
    inviteInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => inviteInputRef.current?.focus(), 350)
  }

  async function checkAndInvite() {
    const normalizedEmail = inviteEmail.trim().toLowerCase()
    if (!normalizedEmail) return
    setInviteLink('')
    setInviteError('')
    setSoloAccountDetected(false)
    setPendingInviteEmail('')
    setInviteEmailedTo('')

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

      // Email the link straight to the client. The link stays on screen as a
      // fallback, so a failed/unconfigured email never blocks inviting.
      try {
        const { data: res, error: fnError } = await supabase.functions.invoke('notify-invite', {
          body: { invitationId: data.id },
        })
        if (fnError || !res?.success) throw fnError || new Error('send failed')
        setInviteEmailedTo(email)
        setToast({ message: `Invite emailed to ${email}`, type: 'success' })
      } catch (err) {
        console.error('notify-invite failed:', err)
        setInviteEmailedTo('')
        setToast({ message: "Couldn't email the invite — copy the link below to share it.", type: 'error' })
      }
    }
  }

  const needsAttention = clients.filter(c =>
    attentionLevel(clientStats[c.client_id]).level === 'red'
  ).length

  // Clients with a check-in the coach hasn't reviewed yet, oldest submission
  // first — so the roster banner's "check-ins to review" can jump straight to
  // the most-waiting one, and drain the queue one click at a time at any scale.
  const reviewClientIds = clients
    .filter(c => { const s = clientStats[c.client_id]; return s?.checkIn && !s.checkIn.reviewed_at })
    .sort((a, b) => (clientStats[a.client_id].checkIn.created_at || '').localeCompare(clientStats[b.client_id].checkIn.created_at || ''))
    .map(c => c.client_id)

  const metricColors = {
    Calories: 'var(--color-calories)',
    Protein: 'var(--color-protein)',
    Cardio: 'var(--color-cardio)',
    Steps: 'var(--color-steps)',
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

      {/* Roster triage headline */}
      {clients.length > 0 && !loading && (
        <RosterBanner
          roster={summarizeRoster(clientStats)}
          onReviewClick={reviewClientIds.length ? () => navigate(`/client/${reviewClientIds[0]}?focus=checkIn`) : undefined}
        />
      )}

      {/* Summary bar */}
      {clients.length > 0 && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <div style={{ ...cardStyle, padding: '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <p style={summaryLabelStyle}>Total clients</p>
            <p style={summaryNumStyle}>{clients.length}</p>
          </div>
          <div style={{ ...cardStyle, padding: '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <p style={summaryLabelStyle}>Checked in this week</p>
            <p style={{ ...summaryNumStyle, color: 'var(--color-success)' }}>
              {clients.filter(c => clientStats[c.client_id]?.checkIn).length}
              <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 400 }}>/{clients.length}</span>
            </p>
          </div>
          <div style={{ ...cardStyle, border: `1px solid ${needsAttention > 0 ? 'var(--color-error)' : 'var(--color-border)'}`, padding: '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <p style={summaryLabelStyle}>Need attention</p>
            <p style={{ ...summaryNumStyle, color: needsAttention > 0 ? 'var(--color-error)' : 'var(--color-success)' }}>{needsAttention}</p>
          </div>
        </div>
      )}

      {/* Client list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ ...cardStyle, padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Skeleton width="38%" height="18px" />
                  <Skeleton width="64px" height="22px" borderRadius="999px" />
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[...Array(4)].map((_, j) => <Skeleton key={j} width="66px" height="22px" borderRadius="999px" />)}
                </div>
              </div>
            ))}
          </div>
        ) : clients.length === 0 ? (
          <EmptyState
            icon={(
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            )}
            title="Add your first client"
            description="Invite someone you coach by email. They get a link to join, and their logging shows up here for you to track."
            action={<Button variant="primary" onClick={focusInvite}>Invite your first client →</Button>}
          />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {clients.length > 1 && (
                <>
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
                      color: sortBy === key ? 'var(--color-on-accent)' : 'var(--color-muted)',
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
                </>
              )}
                <span style={{ marginLeft: 'auto', alignSelf: 'center', display: 'inline-flex', alignItems: 'center' }}>
                  <InfoTip text={`How to read a client card:

▸ Top pill (with a dot) — the single most pressing thing to look at. Colour = urgency: green on track · yellow watch · red intervene now.

▸ Green "adherence · energy" pill — the client's latest check-in self-ratings, each out of 10.

▸ Obstacles — what the client typed in their check-in.

▸ 7-day compliance — one pill per metric: days on target (≈90 %+ of goal) out of the last 7. Dimmer pill = fewer days hit.`} />
                </span>
              </div>
            {sortedClients.map((c) => {
              const s = clientStats[c.client_id]
              const triage = attentionLevel(s)
              const hasAlert = triage.level === 'red'
              const nudge = nudgeReason({ daysSinceLog: s?.daysSinceLog, hasCheckIn: !!s?.checkIn, checkinDue: s?.checkinDue })
              return (
                <div key={c.id} style={{
                  ...cardStyle,
                  border: `1px solid ${hasAlert ? 'var(--color-error)' : 'var(--color-border)'}`,
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <Avatar url={c.client?.avatar_url} name={c.client?.full_name || ''} size={40} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: 'var(--text-md)' }}>{c.client?.full_name || 'Unnamed'}</p>
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: '2px', letterSpacing: '0.01em' }}>{c.client?.email}</p>
                    </div>
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
                        fontSize: 'var(--text-sm)', fontWeight: 700, padding: '3px 10px',
                        borderRadius: '999px',
                        backgroundColor: triage.level === 'green' ? 'var(--color-bg)' : `color-mix(in srgb, ${attentionColors[triage.level]} 15%, transparent)`,
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
                          fontSize: 'var(--text-sm)', fontWeight: 600, padding: '3px 10px',
                          borderRadius: '999px', backgroundColor: 'var(--color-bg)',
                          border: '1px solid var(--color-success)', color: 'var(--color-success)'
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
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                      7-day compliance
                    </p>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {s.lockInfo?.locked && (
                        <span style={{
                          fontSize: 'var(--text-xs)', fontWeight: 700, padding: '3px 10px',
                          borderRadius: '999px', backgroundColor: 'var(--color-bg)',
                          border: '1px solid var(--color-error)', color: 'var(--color-error)'
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
                            fontSize: 'var(--text-xs)', fontWeight: 700, padding: '3px 10px',
                            borderRadius: '999px',
                            backgroundColor: value < 3 ? `color-mix(in srgb, ${metricColor} 15%, transparent)` : 'var(--color-bg)',
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
            ref={inviteInputRef}
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
	            <p style={{ fontSize: 'var(--text-base)', margin: 0 }}>
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
          <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-base)' }}>{inviteError}</p>
        )}
        {inviteLink && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {inviteEmailedTo && (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-success)', fontWeight: 600, margin: 0 }}>
                ✓ Invite emailed to {inviteEmailedTo}
              </p>
            )}
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', margin: 0 }}>
              {inviteEmailedTo ? 'Or share this link directly:' : 'Share this invite link:'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', wordBreak: 'break-all', margin: 0 }}>{inviteLink}</p>
            <button
              onClick={() => navigator.clipboard.writeText(inviteLink)}
              style={{ backgroundColor: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '4px 10px', cursor: 'pointer', fontSize: 'var(--text-sm)', color: 'var(--color-text)', whiteSpace: 'nowrap' }}
            >
              Copy
            </button>
            </div>
          </div>
        )}
      </div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
    </div>
  )
}

export default CoachDashboard
