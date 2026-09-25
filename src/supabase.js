import { createClient } from '@supabase/supabase-js'

let supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// In dev against the LOCAL Supabase stack, derive the host from however the page
// was reached rather than trusting a hard-coded one.
//
// .env.local has to name a host the BROWSER can reach, so LAN-sharing (opening
// the dev server on a phone) pins it to this Mac's LAN IP. That address changes
// every time the machine joins a different network, and when it goes stale the
// app serves its HTML perfectly and then white-screens, because every Supabase
// call fails — a confusing failure that cost real time three separate times.
//
// Deriving it means localhost resolves to localhost and a phone on the LAN
// resolves to the Mac's current address, on any network, with no edits. Guarded
// to DEV and to a local-stack URL (port 54321), so production is untouched.
if (
  import.meta.env.DEV &&
  /^https?:\/\/(localhost|127\.0\.0\.1|\[?[0-9a-fA-F.:]+\]?):54321\/?$/.test(supabaseUrl || '')
) {
  supabaseUrl = `${window.location.protocol}//${window.location.hostname}:54321`
}

export const supabase = createClient(supabaseUrl, supabaseKey)
