import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import ChatBubble from './ChatBubble'

// Self-contained coach-thread chat for a client. Mounted once at the app layout
// level so the message bubble follows the client onto every page (Dashboard,
// Log, Profile, …). The data plumbing previously lived in Dashboard.
export default function ClientChat({ profile }) {
  const [messages, setMessages] = useState([])

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

  async function reactToMessage(messageId, emoji) {
    const { error } = await supabase.from('messages').update({ reaction: emoji }).eq('id', messageId)
    if (error) console.error(error)
    else fetchMessages()
  }

  return (
    <ChatBubble
      messages={messages}
      currentUserId={profile?.id}
      recipientName="your coach"
      onSend={sendMessage}
      onReact={reactToMessage}
      onMarkRead={markMessagesRead}
    />
  )
}
