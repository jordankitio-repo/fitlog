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
      /* D2: a control that needs a different SHAPE overrides the shape — it does
         not get rebuilt. This was a hand-rolled <button>, which meant it had no
         hover and no pressed state at all (only the global brightness blanket),
         and it carried a hardcoded `0 4px 16px rgba(0,0,0,0.45)` — a shadow
         tuned for a near-black ground that smears on the light theme, the same
         bug the account menu and notification centre already had. As a Button
         it inherits the hover, the press sink and the timing by construction;
         only the circle is local. */
      <Button
        className="chat-launcher"
        onClick={handleOpen}
        ariaLabel="Open messages"
        variant="primary"
        style={{
          width: '56px', height: '56px', padding: 0,
          borderRadius: '50%',
          boxShadow: 'var(--shadow-dropdown)',
          /* The sheen STAYS. It was suppressed here once, on the reading that a
             56px circle makes --control-sheen read as a gradient and the system
             allows gradients only on streak and milestone cards. That was the
             wrong rule: the ban is on decorative gradients painted onto cards,
             while --control-sheen IS the control recipe — the top highlight
             every filled Button in the app already carries. Removing it made
             this the one filled button without it, which is the inconsistency
             the conversion was meant to end. */
        }}
      >
        <ChatIcon />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: '-2px', right: '-2px',
            minWidth: 20, height: 20, padding: '0 var(--space-4)', boxSizing: 'border-box',
            borderRadius: '999px', backgroundColor: 'var(--color-error)', color: 'var(--color-on-accent)',
            fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--color-bg)',
          }}>{unread}</span>
        )}
      </Button>
    ), document.body)
  }

  return createPortal((
    <div className="chat-panel" style={{
      backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-dropdown)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <Avatar url={recipientAvatarUrl} name={recipientName} size={28} />
          <span style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-md)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recipientName}</span>
        </span>
        <button onClick={() => setOpen(false)} aria-label="Close messages" style={{ background: 'transparent', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: 'var(--text-title)', lineHeight: 1, padding: '0 4px' }}>×</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 ? (
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)' }}>No messages yet. Send one below.</p>
        ) : messages.map(m => {
          const isMe = m.sender_id === currentUserId
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 4 }}>
              <div style={{ maxWidth: '80%', backgroundColor: isMe ? 'var(--color-primary-fill)' : 'var(--color-bg)', border: isMe ? 'none' : '1px solid var(--color-border)', borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '10px 14px' }}>
                <p style={{ fontSize: 'var(--text-base)', lineHeight: 1.5, color: isMe ? 'var(--color-on-primary-fill)' : 'var(--color-text)' }}>{m.content}</p>
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>{new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <div style={{ padding: 12, borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
        {sendError && (
          <p style={{ margin: '0 0 8px', fontSize: 'var(--text-sm)', color: 'var(--color-error)' }}>
            Couldn&apos;t send. Check your connection and try again.
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" placeholder={`Message ${recipientName}...`} value={text} onChange={e => { setText(e.target.value); if (sendError) setSendError(false) }} onKeyDown={e => e.key === 'Enter' && handleSend()}
            style={{ flex: 1, minWidth: 0, backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 14px', color: 'var(--color-text)', fontSize: 'var(--text-base)' }} />
          <Button onClick={handleSend} disabled={sending} loading={sending} variant="primary">Send</Button>
        </div>
      </div>
    </div>
  ), document.body)
}
