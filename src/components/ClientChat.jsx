import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import ChatBubble from './ChatBubble'
import { fetchMessageWindow, refreshSize, growSize, hasOlderMessages } from '../utils/messageThread'

// Self-contained coach-thread chat for a client. Mounted once at the app layout
// level so the message bubble follows the client onto every page (Dashboard,
// Log, Profile, …). The data plumbing previously lived in Dashboard.
export default function ClientChat({ profile }) {
  const [messages, setMessages] = useState([])
  const [total, setTotal] = useState(0)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [coach, setCoach] = useState(null)

  // `size` is how many of the NEWEST messages to read. Callers pass
  // refreshSize() to re-read the window they already have and growSize() to
  // page further back; the thread is never fetched whole.
  const fetchMessages = useCallback(async (size) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { messages: page, total: count, error } = await fetchMessageWindow(
      (q) => q.eq('client_id', session.user.id),
      size,
    )
    if (error) { console.error(error); return }
    setMessages(page)
    setTotal(count)
  }, [])

  useEffect(() => {
    async function load() { await fetchMessages(refreshSize(0)) }
    load()
  }, [fetchMessages])

  async function loadOlder() {
    setLoadingOlder(true)
    await fetchMessages(growSize(messages.length))
    setLoadingOlder(false)
  }

  // Tell the layout the bottom-right chat FAB is present so the mobile bottom
  // tab bar gives trailing content extra clearance (FAB sits above the bar).
  useEffect(() => {
    document.body.classList.add('has-chat-fab')
    return () => document.body.classList.remove('has-chat-fab')
  }, [])

  // Fetch the client's active coach (name + avatar) for the chat header. RLS
  // allows a client to read their coach's profile (is_profile_related).
  useEffect(() => {
    async function loadCoach() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: rel } = await supabase
        .from('coach_clients')
        .select('coach_id')
        .eq('client_id', session.user.id)
        .eq('status', 'active')
        .maybeSingle()
      if (!rel) return
      const { data: c } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', rel.coach_id)
        .maybeSingle()
      if (c) setCoach(c)
    }
    loadCoach()
  }, [])

  // Mark-read happens when the bubble opens, so the unread badge survives until
  // the client actually opens the thread.
  async function markMessagesRead() {
    const { data: { session } } = await supabase.auth.getSession()
    // Mark read by FILTER, not by the ids currently on screen. The thread is
    // windowed now, so an id list would only ever clear the newest page and
    // anything older would stay unread for good — the badge would never zero
    // out. One indexed update covers the whole thread and no-ops when there is
    // nothing unread.
    await supabase.from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('client_id', session.user.id)
      .neq('sender_id', session.user.id)
      .is('read_at', null)
    await fetchMessages(refreshSize(messages.length))
  }

  async function sendMessage(text) {
    const { data: { session } } = await supabase.auth.getSession()
    const { data: coachRelation } = await supabase
      .from('coach_clients')
      .select('coach_id')
      .eq('client_id', session.user.id)
      .eq('status', 'active')
      .maybeSingle()
    if (!coachRelation) throw new Error('No active coach')
    const { error } = await supabase.from('messages').insert([{
      coach_id: coachRelation.coach_id,
      client_id: session.user.id,
      sender_id: session.user.id,
      content: text,
    }])
    if (error) { console.error(error); throw error }
    await fetchMessages(refreshSize(messages.length))
  }

  return (
    <ChatBubble
      messages={messages}
      currentUserId={profile?.id}
      recipientName={coach?.full_name || 'your coach'}
      recipientAvatarUrl={coach?.avatar_url}
      onSend={sendMessage}
      onMarkRead={markMessagesRead}
      hasOlder={hasOlderMessages(total, messages.length)}
      onLoadOlder={loadOlder}
      loadingOlder={loadingOlder}
    />
  )
}
