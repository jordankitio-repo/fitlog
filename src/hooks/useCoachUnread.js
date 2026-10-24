import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { NOTIF_REFRESH } from '../utils/notifyRefresh'

// How many things the client's coach has sent that they have not opened yet.
//
// Counts messages AND reports together, because both land on /coach and that
// page exists precisely to be ONE thread. pages/Coach.jsx records that the
// split into two channels with two unread counts was built and then removed
// ("moved the seam rather than closing it"). A badge that counted only
// messages would put that second count straight back, just in a different
// widget -- a tab badge next to a bell instead of two tabs on one screen.
//
// Reads `read_at` on both tables rather than the bell's dismissals table.
// read_at is real state the reader creates by opening the thread or the
// report, and on reports it is the same column the coach's sent-list reads
// back. The bell's receipt model exists for events that have no such column;
// these have one, so a second notion of "seen" would be the drift.
//
// Returns 0 for every role but client. A coach's notifications point at
// individual clients (/client/:id), so they have no single destination to
// badge -- their bell is unchanged.
export function useCoachUnread(role) {
  const [count, setCount] = useState(0)

  const load = useCallback(async () => {
    if (role !== 'client') return
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) return

    // head + exact: the number is all that is wanted, so no rows cross the
    // wire. The thread is windowed and a long-quiet client can have hundreds.
    const [msg, rep] = await Promise.all([
      supabase.from('messages').select('id', { count: 'exact', head: true })
        .eq('client_id', uid).neq('sender_id', uid).is('read_at', null),
      supabase.from('reports').select('id', { count: 'exact', head: true })
        .eq('client_id', uid).is('read_at', null),
    ])
    setCount((msg.count || 0) + (rep.count || 0))
  }, [role])

  useEffect(() => {
    if (role !== 'client') return
    // Wrapped rather than called bare, the same shape NotificationCenter uses:
    // `load` is async so it never sets state synchronously, but
    // react-hooks/set-state-in-effect cannot see that through the call and
    // flags the bare call.
    async function run() { await load() }
    run()
    // Same two triggers the bell uses, so the badge and the bell can never
    // disagree about how fresh they are: returning to the tab, and the
    // app-wide refresh event anything that writes a notification fires.
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(NOTIF_REFRESH, load)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(NOTIF_REFRESH, load)
    }
  }, [role, load])

  return role === 'client' ? count : 0
}
