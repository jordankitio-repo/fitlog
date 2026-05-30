import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'

function CoachDashboard({ profile }) {
  const [clients, setClients] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState('')

  useEffect(() => {
    fetchClients()
  }, [])
  const navigate = useNavigate()

  async function fetchClients() {
  const { data: relationships, error } = await supabase
    .from('coach_clients')
    .select('*')
    .eq('coach_id', profile.id)
    .eq('status', 'active')

  if (error) { console.error('Error fetching clients:', error); return }
  if (!relationships.length) { setClients([]); return }

  const clientIds = relationships.map(r => r.client_id)

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .in('id', clientIds)

  if (profileError) { console.error('Error fetching profiles:', profileError); return }

  const merged = relationships.map(r => ({
    ...r,
    client: profiles.find(p => p.id === r.client_id)
  }))

  setClients(merged)
}

  async function sendInvite() {
    if (!inviteEmail) return
    setInviteStatus('')

    const { data, error } = await supabase
      .from('invitations')
      .insert([{
        coach_id: profile.id,
        client_email: inviteEmail
      }])
      .select()
      .single()

    if (error) {
      setInviteStatus('Error sending invite.')
      console.error(error)
    } else {
      const link = `${window.location.origin}/join?token=${data.token}`
      setInviteStatus(link)
      setInviteEmail('')
    }
    
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h1>Coach Dashboard</h1>
        <p style={{ marginTop: '4px' }}>Welcome, {profile.full_name}</p>
      </div>

      <div style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <h2>Invite a client</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="email"
            placeholder="Client email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            style={{
              flex: 1,
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              padding: '10px 14px',
              color: 'var(--color-text)',
              fontSize: '1rem'
            }}
          />
          <button onClick={sendInvite} style={{
            backgroundColor: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius)',
            padding: '10px 20px',
            cursor: 'pointer',
            fontWeight: 600
          }}>
            Send invite
          </button>
        </div>
        {inviteStatus && (
          <div style={{
            backgroundColor: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
              Share this link with your client:
            </p>
            <p style={{
              fontSize: '0.8rem',
              color: 'var(--color-primary)',
              wordBreak: 'break-all',
              fontFamily: 'monospace'
            }}>
              {inviteStatus}
            </p>
            <button
              onClick={() => navigator.clipboard.writeText(inviteStatus)}
              style={{
                backgroundColor: 'transparent',
                color: 'var(--color-muted)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius)',
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                width: 'fit-content'
              }}
            >
              Copy link
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h2>Your clients</h2>
        {clients.length === 0 ? (
          <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>
            No active clients yet. Send an invite above.
          </p>
        ) : (
          clients.map((c) => (
            <div key={c.id} style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <p style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                  {c.client?.full_name || 'Unnamed'}
                </p>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
                  {c.client?.email}
                </p>
              </div>
              <button onClick={() => navigate(`/client/${c.client_id}`)} style={{
                backgroundColor: 'transparent',
                color: 'var(--color-primary)',
                border: '1px solid var(--color-primary)',
                borderRadius: 'var(--radius)',
                padding: '6px 14px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}>
                View data
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default CoachDashboard