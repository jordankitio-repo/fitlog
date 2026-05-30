import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

function CoachDashboard({ profile }) {
  const [clients, setClients] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState('')

  useEffect(() => {
    fetchClients()
  }, [])

  async function fetchClients() {
    const { data, error } = await supabase
      .from('coach_clients')
      .select(`
        *,
        client:client_id (
          id,
          email,
          full_name
        )
      `)
      .eq('coach_id', profile.id)
      .eq('status', 'active')

    if (error) console.error('Error fetching clients:', error)
    else setClients(data)
  }

  async function sendInvite() {
    if (!inviteEmail) return
    setInviteStatus('')

    const { error } = await supabase
      .from('invitations')
      .insert([{
        coach_id: profile.id,
        client_email: inviteEmail
      }])

    if (error) {
      setInviteStatus('Error sending invite.')
      console.error(error)
    } else {
      setInviteStatus(`Invite sent to ${inviteEmail}`)
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
          <p style={{ fontSize: '0.875rem', color: 'var(--color-primary)' }}>{inviteStatus}</p>
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
              <button style={{
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