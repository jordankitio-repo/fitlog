import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'

function toLocalDateString(date) {
  return new Date(date).toISOString().split('T')[0]
}

function CoachDashboard({ profile }) {
  const [clients, setClients] = useState([])
  const [clientStats, setClientStats] = useState({})
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchClients()
  }, [])

  async function fetchClients() {
    setLoading(true)

    const { data: relationships, error } = await supabase
      .from('coach_clients')
      .select('*')
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
    await fetchAllClientStats(clientIds)
    setLoading(false)
  }

  async function fetchAllClientStats(clientIds) {
    const weekOf = toLocalDateString(new Date(new Date().setDate(new Date().getDate() - new Date().getDay())))
    const negativeEmojis = ['👎', '😔', '😰', '🤕', '😴']

    // Three batch queries in parallel
    const [logsResult, checkInsResult, messagesResult] = await Promise.all([
      supabase
        .from('nutrition_log')
        .select('user_id, logged_date')
        .in('user_id', clientIds)
        .order('logged_date', { ascending: false }),

      supabase
        .from('check_ins')
        .select('*')
        .in('client_id', clientIds)
        .eq('week_of', weekOf),

      supabase
        .from('coach_messages')
        .select('client_id, reaction, content, created_at')
        .in('client_id', clientIds)
        .eq('coach_id', profile.id)
        .not('reaction', 'is', null)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    ])

    const recentLogs = logsResult.data || []
    const checkIns = checkInsResult.data || []
    const messages = messagesResult.data || []

    const stats = {}
    clientIds.forEach(id => {
      const clientLogs = recentLogs.filter(l => l.user_id === id)
      const lastLogDate = clientLogs.length > 0 ? clientLogs[0].logged_date : null
      const today = toLocalDateString(new Date())
      const yesterday = toLocalDateString(new Date(Date.now() - 86400000))

      let daysSinceLog = null
      if (lastLogDate) {
        daysSinceLog = Math.floor((new Date(today) - new Date(lastLogDate)) / 86400000)
      }

      const checkIn = checkIns.find(c => c.client_id === id) || null
      const concerningReactions = messages.filter(
        m => m.client_id === id && negativeEmojis.includes(m.reaction)
      )

      stats[id] = { lastLogDate, daysSinceLog, checkIn, concerningReactions }
    })

    setClientStats(stats)
  }

  function logColor(days) {
    if (days === null) return '#f87171'
    if (days <= 1) return '#34d399'
    if (days <= 3) return '#fbbf24'
    return '#f87171'
  }

  function logLabel(days) {
    if (days === null) return 'Never logged'
    if (days === 0) return 'Logged today'
    if (days === 1) return 'Logged yesterday'
    return `${days} days ago`
  }

  async function sendInvite() {
    if (!inviteEmail) return
    setInviteStatus('')
    const { data, error } = await supabase
      .from('invitations')
      .insert([{ coach_id: profile.id, client_email: inviteEmail }])
      .select().single()
    if (error) { setInviteStatus('Error sending invite.'); console.error(error) }
    else { setInviteStatus(`${window.location.origin}/join?token=${data.token}`); setInviteEmail('') }
  }

  const needsAttention = clients.filter(c => {
    const s = clientStats[c.client_id]
    if (!s) return false
    return (s.daysSinceLog === null || s.daysSinceLog >= 4) || s.concerningReactions.length > 0
  }).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1>Coach Dashboard</h1>
        <p style={{ marginTop: '4px', color: 'var(--color-muted)' }}>Welcome, {profile.full_name}</p>
      </div>

      {/* Summary bar */}
      {clients.length > 0 && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '4px' }}>Total clients</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{clients.length}</p>
          </div>
          <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '4px' }}>Checked in this week</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#34d399' }}>
              {clients.filter(c => clientStats[c.client_id]?.checkIn).length}
              <span style={{ fontSize: '0.875rem', color: 'var(--color-muted)', fontWeight: 400 }}>/{clients.length}</span>
            </p>
          </div>
          <div style={{ backgroundColor: 'var(--color-surface)', border: `1px solid ${needsAttention > 0 ? '#f87171' : 'var(--color-border)'}`, borderRadius: 'var(--radius)', padding: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '4px' }}>Need attention</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, color: needsAttention > 0 ? '#f87171' : '#34d399' }}>{needsAttention}</p>
          </div>
        </div>
      )}

      {/* Client list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h2>Your clients</h2>
        {loading ? (
          <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>Loading...</p>
        ) : clients.length === 0 ? (
          <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>No active clients yet. Send an invite below.</p>
        ) : (
          clients.map((c) => {
            const s = clientStats[c.client_id]
            const hasAlert = s && (s.daysSinceLog === null || s.daysSinceLog >= 4 || s.concerningReactions.length > 0)
            return (
              <div key={c.id} style={{
                backgroundColor: 'var(--color-surface)',
                border: `1px solid ${hasAlert ? '#f87171' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius)',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontWeight: 600 }}>{c.client?.full_name || 'Unnamed'}</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>{c.client?.email}</p>
                  </div>
                  <button onClick={() => navigate(`/client/${c.client_id}`)} style={{
                    backgroundColor: 'transparent', color: 'var(--color-primary)',
                    border: '1px solid var(--color-primary)', borderRadius: 'var(--radius)',
                    padding: '6px 14px', cursor: 'pointer', fontSize: '0.875rem'
                  }}>
                    View data →
                  </button>
                </div>

                {/* Stats row */}
                {s && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Last log */}
                    <span style={{
                      fontSize: '0.75rem', fontWeight: 600, padding: '3px 10px',
                      borderRadius: '999px', backgroundColor: 'var(--color-bg)',
                      border: `1px solid ${logColor(s.daysSinceLog)}`,
                      color: logColor(s.daysSinceLog)
                    }}>
                      {logLabel(s.daysSinceLog)}
                    </span>

                    {/* Check-in */}
                    {s.checkIn ? (
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 600, padding: '3px 10px',
                        borderRadius: '999px', backgroundColor: 'var(--color-bg)',
                        border: '1px solid #34d399', color: '#34d399'
                      }}>
                        ✓ Check-in: {s.checkIn.adherence_rating}/10 adherence · {s.checkIn.energy_level}/10 energy
                      </span>
                    ) : (
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 600, padding: '3px 10px',
                        borderRadius: '999px', backgroundColor: 'var(--color-bg)',
                        border: '1px solid var(--color-border)', color: 'var(--color-muted)'
                      }}>
                        No check-in this week
                      </span>
                    )}

                    {/* Concerning reactions */}
                    {s.concerningReactions.length > 0 && (
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 600, padding: '3px 10px',
                        borderRadius: '999px', backgroundColor: 'var(--color-bg)',
                        border: '1px solid #fbbf24', color: '#fbbf24'
                      }}>
                        {s.concerningReactions.map(m => m.reaction).join(' ')} reaction
                      </span>
                    )}
                  </div>
                )}

                {/* Obstacles preview */}
                {s?.checkIn?.obstacles && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', paddingTop: '4px', borderTop: '1px solid var(--color-border)' }}>
                    <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>Obstacles: </span>
                    {s.checkIn.obstacles}
                  </p>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Invite section */}
      <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h2>Invite a client</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="email"
            placeholder="Client email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            style={{ flex: 1, backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 14px', color: 'var(--color-text)', fontSize: '1rem' }}
          />
          <button onClick={sendInvite} style={{ backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', padding: '10px 20px', cursor: 'pointer', fontWeight: 600 }}>
            Send invite
          </button>
        </div>
        {inviteStatus && (
          <div style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Share this link with your client:</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-primary)', wordBreak: 'break-all', fontFamily: 'monospace' }}>{inviteStatus}</p>
            <button onClick={() => navigator.clipboard.writeText(inviteStatus)} style={{ backgroundColor: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem', width: 'fit-content' }}>
              Copy link
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default CoachDashboard
