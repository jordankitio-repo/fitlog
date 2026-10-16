// Windowed reads for a coach/client message thread.
//
// All three thread surfaces (the client's ChatBubble, the coach's ClientView
// panel, the client's Coach page) used to fetch the ENTIRE conversation with
// `select('*')` and no limit, every time the thread opened. Two years of
// coaching re-downloaded two years of messages. Worse, marking the thread read
// refetched it again, so opening a thread cost two full-history reads.
//
// Reports already solved this (Reports.jsx: PAGE, range(), "Show older") and
// messages simply never got the same treatment. This is that treatment, shared
// so the three surfaces cannot drift apart the way the two report views did.
//
// The window is anchored at the NEWEST message and grows backwards, which is
// the opposite of the reports list: a chat is read from the bottom, so the
// newest page is the one you need first and "older" means further up.
import { supabase } from '../supabase'

export const MESSAGE_PAGE = 50

// A window is always anchored at the NEWEST message (offset 0 of a descending
// order) and described by its size. Two sizes matter, and conflating them is a
// bug: refreshing after a send must re-read the SAME window, while "show older"
// must read a bigger one. Re-reading rather than appending is deliberate —
// unlike a report, a message mutates after you have it (read_at) and new ones
// land at the end, so an append-only list goes stale. The window is bounded
// either way, which is the entire point.
export function refreshSize(loadedCount = 0) {
  return Math.max(loadedCount, MESSAGE_PAGE)
}

export function growSize(loadedCount = 0) {
  return Math.max(loadedCount, MESSAGE_PAGE) + MESSAGE_PAGE
}

// Rows arrive newest-first (the only way to anchor a window at the end of a
// thread). Render order is oldest-first, so flip them once, here, rather than
// at three call sites.
export function toOldestFirst(rows) {
  return (rows || []).slice().reverse()
}

export function hasOlderMessages(total, loadedCount) {
  return (total ?? 0) > loadedCount
}

// `applyFilter` scopes the query to one thread and differs per surface (a client
// filters on their own client_id, a coach on coach_id AND client_id), so it is
// passed in rather than branched on a role flag here.
export async function fetchMessageWindow(applyFilter, size = MESSAGE_PAGE) {
  const { data, error, count } = await applyFilter(
    supabase.from('messages').select('*', { count: 'exact' })
  )
    .order('created_at', { ascending: false })
    .range(0, size - 1)
  if (error) return { messages: [], total: 0, error }
  return { messages: toOldestFirst(data), total: count ?? (data || []).length, error: null }
}
