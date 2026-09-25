// Resolves the LOCAL Supabase stack's URL + keys by shelling out to the CLI.
// Local keys are static per machine, so we read them once and cache. This keeps
// the harness self-contained — no .env wiring, and it fails loudly with a fix
// hint if the stack isn't up.
import { execSync } from 'node:child_process'

let cached

export function localEnv() {
  if (cached) return cached
  let out
  try {
    out = execSync('supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    throw new Error(
      'Local Supabase is not running. Start the RLS test DB first:\n' +
      '  npm run rls:setup\n',
    )
  }
  const env = {}
  for (const line of out.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="(.*)"$/)
    if (m) env[m[1]] = m[2]
  }
  if (!env.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) {
    throw new Error('Could not read local Supabase keys from `supabase status -o env`.')
  }
  // DB_URL is a DIRECT postgres connection, bypassing PostgREST. Needed only by
  // tests that must hold a transaction open across statements — PostgREST gives
  // every request its own transaction and ends it before responding, so
  // lock/visibility behaviour cannot be exercised through the REST API.
  cached = {
    url: env.API_URL,
    anonKey: env.ANON_KEY,
    serviceKey: env.SERVICE_ROLE_KEY,
    dbUrl: env.DB_URL,
  }
  return cached
}
