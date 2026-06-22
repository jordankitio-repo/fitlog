import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import ChatBubble from './ChatBubble'

// Self-contained coach-thread chat for a client. Mounted once at the app layout
// level so the message bubble follows the client onto every page (Dashboard,
// Log, Profile, …). The data plumbing previously lived in Dashboard.
export default function ClientChat({ profile }) {
  const [messages, setMessages] = useState([])
  const [coach, setCoach] = useState(null)

  const fetchMessages = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('client_id', session.user.id)
      .order('created_at', { ascending: true })
    if (error) console.error(error)
    else setMessages(data)
  }, [])

  useEffect(() => {
    async function load() { await fetchMessages() }
    load()
  }, [fetchMessages])

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
    const unreadIds = messages
      .filter((m) => !m.read_at && m.sender_id !== session.user.id)
      .map((m) => m.id)
    if (unreadIds.length === 0) return
    await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds)
    await fetchMessages()
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
    await fetchMessages()
  }

  return (
    <ChatBubble
      messages={messages}
      currentUserId={profile?.id}
      recipientName={coach?.full_name || 'your coach'}
      recipientAvatarUrl={coach?.avatar_url}
      onSend={sendMessage}
      onMarkRead={markMessagesRead}
    />
  )
}
