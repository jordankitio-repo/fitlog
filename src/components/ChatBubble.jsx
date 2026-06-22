import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import Button from './Button'
import Avatar from './Avatar'

// A per-thread chat widget pinned to the bottom-right corner. Presentational +
// open/close only — the page owns the data (messages, send, mark-read). Used on
// the coach's ClientView (thread with that one client) and the client's
// Dashboard (thread with their coach). Launcher shows an unread badge; opening
// marks the thread read.

function ChatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

export default function ChatBubble({ messages = [], currentUserId, recipientName = 'client', recipientAvatarUrl, onSend, onMarkRead }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(false)
  const endRef = useRef(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const unread = messages.filter(m => !m.read_at && m.sender_id !== currentUserId).length

  // Open straight to the chat when a "Message" notification deep-links here.
  useEffect(() => {
    if (searchParams.get('focus') !== 'chat') return
    const raf = requestAnimationFrame(() => setOpen(true))
    if (onMarkRead) onMarkRead()
    const sp = new URLSearchParams(searchParams)
    sp.delete('focus')
    setSearchParams(sp, { replace: true })
    return () => cancelAnimationFrame(raf)
  }, [searchParams, onMarkRead, setSearchParams])

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' })
  }, [open, messages])

  async function handleOpen() {
    setOpen(true)
    if (unread > 0 && onMarkRead) await onMarkRead()
  }

  async function handleSend() {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    setSendError(false)
    // Keep the text on failure AND show why, so a message never silently fails.
    try { await onSend(t); setText('') } catch { setSendError(true) } finally { setSending(false) }
  }

  if (!open) {
    return createPortal((
      <button className="chat-launcher" onClick={handleOpen} aria-label="Open messages"
        style={{
          width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
          backgroundColor: 'var(--color-primary)', color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        <ChatIcon />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, padding: '0 5px',
            borderRadius: 10, backgroundColor: '#f87171', color: '#fff', fontSize: '0.7rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--color-bg)',
          }}>{unread}</span>
        )}
      </button>
    ), document.body)
  }

  return createPortal((
    <div className="chat-panel" style={{
      backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)', boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <Avatar url={recipientAvatarUrl} name={recipientName} size={28} />
          <span style={{ fontWeight: 700, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recipientName}</span>
        </span>
        <button onClick={() => setOpen(false)} aria-label="Close messages" style={{ background: 'transparent', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1, padding: '0 4px' }}>×</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>No messages yet. Send one below.</p>
        ) : messages.map(m => {
          const isMe = m.sender_id === currentUserId
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 4 }}>
              <div style={{ maxWidth: '80%', backgroundColor: isMe ? 'var(--color-primary)' : 'var(--color-bg)', border: isMe ? 'none' : '1px solid var(--color-border)', borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '10px 14px' }}>
                <p style={{ fontSize: '0.875rem', lineHeight: 1.5, color: isMe ? '#fff' : 'var(--color-text)' }}>{m.content}</p>
              </div>
              <p style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>{new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <div style={{ padding: 12, borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
        {sendError && (
          <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: 'var(--color-error)' }}>
            Couldn&apos;t send — check your connection and try again.
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" placeholder={`Message ${recipientName}...`} value={text} onChange={e => { setText(e.target.value); if (sendError) setSendError(false) }} onKeyDown={e => e.key === 'Enter' && handleSend()}
            style={{ flex: 1, minWidth: 0, backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 14px', color: 'var(--color-text)', fontSize: '0.875rem' }} />
          <Button onClick={handleSend} disabled={sending} loading={sending} variant="primary">Send</Button>
        </div>
      </div>
    </div>
  ), document.body)
}
