import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import { resolveLockState } from '../utils/lockState'
import { getCurrentWeekSunday, toLocalDateString } from '../utils/dateHelpers'

function CoachDashboard({ profile }) {
  const [clients, setClients] = useState([])
  const [clientStats, setClientStats] = useState({})
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [soloAccountDetected, setSoloAccountDetected] = useState(false)
  const [pendingInviteEmail, setPendingInviteEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchClients()
  }, [])

  async function fetchClients() {
    setLoading(true)

    const { data: relationships, error } = await supabase
      .from('coach_clients')
      .select('id, coach_id, client_id, status, created_at, lock_cleared_at')
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
    const weekOf = getCurrentWeekSunday()
    const negativeEmojis = ['👎', '😔', '😰', '🤕', '😴']
    const sevenDaysAgo = toLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    const today = toLocalDateString(new Date())

    const [logsResult, checkInsResult, messagesResult, nutritionResult, cardioResult, stepsResult, targetsResult] = await Promise.all([
      supabase.from('nutrition_log').select('user_id, logged_date').in('user_id', clientIds).order('logged_date', { ascending: false }),
      supabase.from('check_ins').select('*').in('client_id', clientIds).eq('week_of', weekOf),
      supabase.from('coach_messages').select('client_id, reaction, content, created_at').in('client_id', clientIds).eq('coach_id', profile.id).not('reaction', 'is', null).gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('nutrition_log').select('user_id, logged_date, calories, protein').in('user_id', clientIds).gte('logged_date', sevenDaysAgo).lte('logged_date', today),
      supabase.from('cardio_log').select('user_id, logged_date, duration').in('user_id', clientIds).gte('logged_date', sevenDaysAgo).lte('logged_date', today),
      supabase.from('steps_log').select('user_id, logged_date, steps').in('user_id', clientIds).gte('logged_date', sevenDaysAgo).lte('logged_date', today),
      supabase.from('targets').select('user_id, calories, protein, cardio_minutes, steps').in('user_id', clientIds),
    ])

    const recentLogs = logsResult.data || []
    const checkIns = checkInsResult.data || []
    const messages = messagesResult.data || []
    const nutritionData = nutritionResult.data || []
    const cardioData = cardioResult.data || []
    const stepsData = stepsResult.data || []
    const targetsData = targetsResult.data || []

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i); return toLocalDateString(d)
    })

    const stats = {}
    clientIds.forEach(id => {
      const clientLogs = recentLogs.filter(l => l.user_id === id)
      const lastLogDate = clientLogs.length > 0 ? clientLogs[0].logged_date : null
      const relationship = relationships.find(r => r.client_id === id)
      const lockInfo = relationship ? resolveLockState({
        lastNutritionDate: lastLogDate,
        connectionCreatedAt: relationship.created_at?.split('T')[0],
        lockClearedAt: relationship.lock_cleared_at
      }) : { locked: false, days: 0, reason: 'active' }
      const todayStr = toLocalDateString(new Date())
      let daysSinceLog = null
      if (lastLogDate) daysSinceLog = Math.floor((new Date(todayStr) - new Date(lastLogDate)) / 86400000)

      const checkIn = checkIns.find(c => c.client_id === id) || null
      const concerningReactions = messages.filter(m => m.client_id === id && negativeEmojis.includes(m.reaction))
      const clientTargets = targetsData.find(t => t.user_id === id)

      const complianceItems = []

      if (clientTargets?.calories) {
        let count = 0
        last7Days.forEach(date => {
          const dayTotal = nutritionData.filter(n => n.user_id === id && n.logged_date === date).reduce((sum, n) => sum + (n.calories || 0), 0)
          if (dayTotal > 0 && dayTotal >= clientTargets.calories * 0.9) count++
        })
        complianceItems.push({ label: 'Calories', value: count })
      }

      if (clientTargets?.protein) {
        let count = 0
        last7Days.forEach(date => {
          const dayTotal = nutritionData.filter(n => n.user_id === id && n.logged_date === date).reduce((sum, n) => sum + (n.protein || 0), 0)
          if (dayTotal > 0 && dayTotal >= clientTargets.protein * 0.9) count++
        })
        complianceItems.push({ label: 'Protein', value: count })
      }

      if (clientTargets?.cardio_minutes) {
        let count = 0
        last7Days.forEach(date => {
          const dayTotal = cardioData.filter(c => c.user_id === id && c.logged_date === date).reduce((sum, c) => sum + (c.duration || 0), 0)
          if (dayTotal >= clientTargets.cardio_minutes * 0.9) count++
        })
        complianceItems.push({ label: 'Cardio', value: count })
      }

      if (clientTargets?.steps) {
        let count = 0
        last7Days.forEach(date => {
          const daySteps = stepsData.find(s => s.user_id === id && s.logged_date === date)
          if (daySteps && daySteps.steps >= clientTargets.steps * 0.9) count++
        })
        complianceItems.push({ label: 'Steps', value: count })
      }

      stats[id] = { lastLogDate, daysSinceLog, checkIn, concerningReactions, complianceItems, lockInfo }
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

  async function checkAndInvite() {
    const normalizedEmail = inviteEmail.trim().toLowerCase()
    if (!normalizedEmail) return
    setInviteLink('')
    setInviteError('')
    setSoloAccountDetected(false)
    setPendingInviteEmail('')

    // Check if email already exists in profiles
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existing?.role === 'coach') {
      setInviteError('This email belongs to a coach account and cannot be invited as a client.')
      setInviteLink('')
      return
    }

    if (existing?.role === 'client') {
      const { data: alreadyMyClient } = await supabase
        .from('coach_clients')
        .select('id')
        .eq('coach_id', profile.id)
        .eq('client_id', existing.id)
        .eq('status', 'active')
        .maybeSingle()

      if (alreadyMyClient) {
        setInviteError('This person is already your client.')
        setInviteLink('')
        return
      }

      setInviteError('This person is already connected to another coach.')
      setInviteLink('')
      return
    }

    const { data: pendingInvite } = await supabase
      .from('invitations')
      .select('id')
      .eq('coach_id', profile.id)
      .eq('client_email', normalizedEmail)
      .eq('status', 'pending')
      .maybeSingle()

    if (pendingInvite) {
      setInviteError('You already sent an invite to this email.')
      setInviteLink('')
      return
    }

    if (existing?.role === 'solo') {
      setPendingInviteEmail(normalizedEmail)
      setSoloAccountDetected(true)
      return
    }

    // No existing account or existing solo confirmed — send invite
    await sendInvite(normalizedEmail)
  }

  async function sendInvite(email) {
    const { data, error } = await supabase
      .from('invitations')
      .insert([{ coach_id: profile.id, client_email: email }])
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

  const needsAttention = clients.filter(c => {
    const s = clientStats[c.client_id]
    if (!s) return false
    return (s.daysSinceLog === null || s.daysSinceLog >= 4) || s.concerningReactions.length > 0
  }).length

  return (
    <div className="page-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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
          <EmptyState
            icon="👥"
            title="No clients yet"
            description="Send an invite below to add your first client."
          />
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
                  <Button onClick={() => navigate(`/client/${c.client_id}`)} variant="outline" size="sm">
                    View data →
                  </Button>
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

                {/* 7-day compliance pills */}
                {(s?.complianceItems?.length > 0 || s?.lockInfo?.locked) && (
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
                      {s.complianceItems.map(({ label, value }) => {
                        const color = value >= 5 ? '#34d399' : value >= 3 ? '#fbbf24' : '#f87171'
                        return (
                          <span key={label} style={{
                            fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px',
                            borderRadius: '999px', backgroundColor: 'var(--color-bg)',
                            border: `1px solid ${color}`, color
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
        )}
      </div>

      {/* Invite section */}
      <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
	              <strong>{pendingInviteEmail}</strong> already has a FitLog account. Send them an invite to connect as your client? Their existing data will be preserved.
	            </p>
	            <div style={{ display: 'flex', gap: '8px' }}>
	              <Button
	                onClick={() => sendInvite(pendingInviteEmail)}
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
    </div>
  )
}

export default CoachDashboard
