import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Button from './Button'

// A per-thread chat widget pinned to the bottom-right corner. Presentational +
// open/close only — the page owns the data (messages, send, react, mark-read).
// Used on the coach's ClientView (thread with that one client) and the client's
// Dashboard (thread with their coach). Launcher shows an unread badge; opening
// marks the thread read.

// Reactions come from the native OS emoji picker now (any emoji). Keep just the
// first grapheme so a reaction stays a single glyph even if extra is typed.
function firstEmoji(str) {
  const s = (str || '').trim()
  if (!s) return ''
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return [...seg.segment(s)][0]?.segment || s
  } catch {
    return s
  }
}

function ChatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

export default function ChatBubble({ messages = [], currentUserId, recipientName = 'client', onSend, onReact, onMarkRead }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [openReactId, setOpenReactId] = useState(null)
  const [reactDraft, setReactDraft] = useState('')
  const endRef = useRef(null)

  function openReact(id) {
    setReactDraft('')
    setOpenReactId(openReactId === id ? null : id)
  }
  function applyReaction(id) {
    const emoji = firstEmoji(reactDraft)
    if (emoji) onReact(id, emoji)
    setOpenReactId(null)
    setReactDraft('')
  }

  const unread = messages.filter(m => !m.read_at && m.sender_id !== currentUserId).length

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
    try { await onSend(t); setText('') } catch { /* keep text on failure */ } finally { setSending(false) }
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
        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{recipientName}</span>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>{new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                {m.reaction && <span style={{ fontSize: '0.875rem' }}>{m.reaction}</span>}
                {!isMe && onReact && (
                  <button onClick={() => openReact(m.id)} style={{ background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 6, padding: '1px 6px', cursor: 'pointer', fontSize: '0.65rem', color: 'var(--color-muted)' }}>{m.reaction ? '✎' : 'React +'}</button>
                )}
              </div>
              {openReactId === m.id && onReact && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <input
                    autoFocus
                    type="text"
                    maxLength={20}
                    value={reactDraft}
                    onChange={e => setReactDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') applyReaction(m.id)
                      else if (e.key === 'Escape') { setOpenReactId(null); setReactDraft('') }
                    }}
                    placeholder="Pick an emoji 🙂"
                    style={{ width: 130, backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 8px', color: 'var(--color-text)', fontSize: '0.95rem' }}
                  />
                  <button onClick={() => applyReaction(m.id)} style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 11px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600 }}>Add</button>
                  {m.reaction && <button onClick={() => { onReact(m.id, null); setOpenReactId(null); setReactDraft('') }} style={{ background: 'transparent', border: '1px solid #f87171', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontSize: '0.65rem', color: '#f87171', fontWeight: 600 }}>Remove</button>}
                </div>
              )}
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
        <input type="text" placeholder={`Message ${recipientName}...`} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()}
          style={{ flex: 1, minWidth: 0, backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 14px', color: 'var(--color-text)', fontSize: '0.875rem' }} />
        <Button onClick={handleSend} disabled={sending} loading={sending} variant="primary">Send</Button>
      </div>
    </div>
  ), document.body)
}
