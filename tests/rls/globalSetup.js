// Runs once before the RLS suite. Verifies the local stack is up AND that the
// prod schema has been loaded into it (the harness needs the real tables/policies).
import { createClient } from '@supabase/supabase-js'
import { localEnv } from './env.js'

export async function setup() {
  const { url, serviceKey } = localEnv() // throws with a fix hint if stack is down
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { error } = await admin.from('profiles').select('id').limit(1)
  if (error) {
    throw new Error(
      'Local Supabase is up but the schema is not loaded (could not read public.profiles: ' +
      `${error.message}).\nRun:  npm run rls:setup\n`,
    )
  }

  // Ensure post-baseline migrations are applied (else the hardening tests fail
  // for the wrong reason). get_invitation_by_token ships in 20260615000000.
  const { error: rpcErr } = await admin.rpc('get_invitation_by_token', {
    p_token: '00000000-0000-0000-0000-000000000000',
  })
  if (rpcErr && /(function|does not exist|find the function|PGRST202)/i.test(`${rpcErr.message} ${rpcErr.code}`)) {
    throw new Error(
      'Post-baseline migrations are not applied to the local DB.\nRun:  npm run rls:setup\n',
    )
  }
}
