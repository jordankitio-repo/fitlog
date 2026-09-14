import { describe, it, expect } from 'vitest'
// Vite's ?raw gives us the edge function's source as a string without needing
// node:fs (and without `process`, which isn't in this project's browser lint
// globals). Bundled at transform time, so a missing file fails loudly.
import redeemInviteSource from '../../supabase/functions/redeem-invite/index.ts?raw'
import { inviteErrorMessage, DEAD_INVITE } from './inviteErrors'

describe('inviteErrorMessage', () => {
  it('maps every symbol accept_invitation can raise', () => {
    expect(inviteErrorMessage('invite_not_found')).toBe(DEAD_INVITE)
    expect(inviteErrorMessage('invite_already_used')).toBe(DEAD_INVITE)
    expect(inviteErrorMessage('invite_expired')).toContain('expired')
    expect(inviteErrorMessage('invite_email_mismatch')).toContain('different email')
    expect(inviteErrorMessage('coach_cannot_accept')).toContain('coach account')
    expect(inviteErrorMessage('already_coached')).toContain('already connected')
    expect(inviteErrorMessage('not_authenticated')).toContain('session expired')
  })

  // What actually arrives from PostgREST is the raised symbol wrapped in
  // Postgres/PostgREST prose, not the bare symbol — so substring matching is
  // load-bearing, not incidental.
  it('finds the symbol inside a full Postgres error message', () => {
    const raw = 'invite_already_used\nCONTEXT: PL/pgSQL function public.accept_invitation(text,uuid,text) line 42 at RAISE'
    expect(inviteErrorMessage(raw)).toBe(DEAD_INVITE)
  })

  // "never existed", "already used" and "revoked" are indistinguishable to a
  // stranger holding a link, and telling them apart leaks whether a token was
  // ever real. Same copy on purpose — if these ever diverge, that's the bug.
  it('does not distinguish a dead token from one that never existed', () => {
    expect(inviteErrorMessage('invite_not_found')).toBe(inviteErrorMessage('invite_already_used'))
  })

  it('passes through finished copy from the edge function unchanged', () => {
    const fromServer = 'This invite was sent to a different email address.'
    expect(inviteErrorMessage(fromServer)).toBe(fromServer)
  })

  it('falls back to generic copy for null, undefined and empty input', () => {
    const generic = 'Could not accept this invite. Please try again.'
    expect(inviteErrorMessage(null)).toBe(generic)
    expect(inviteErrorMessage(undefined)).toBe(generic)
    expect(inviteErrorMessage('')).toBe(generic)
  })

  // A raw Postgres string must never reach the user, but an unrecognised
  // message is still shown verbatim rather than swallowed — deliberate, since
  // supabase-js network errors ("Failed to fetch") arrive here too and are
  // more useful than "please try again".
  it('returns an unrecognised message as-is', () => {
    expect(inviteErrorMessage('Failed to fetch')).toBe('Failed to fetch')
  })
})

// The same symbols are mapped a second time inside redeem-invite (it returns
// finished copy, because an unauthenticated caller has no client-side mapper).
// Two hand-maintained copies of one table drift silently: the server adds a
// case, the browser keeps showing "Could not accept this invite." This test is
// the thing that notices.
describe('parity with redeem-invite', () => {
  const serverSymbols = [...redeemInviteSource.matchAll(/message\.includes\('([a-z_]+)'\)/g)]
    .map((m) => m[1])

  it('found the server-side mapping (guards against this test silently passing)', () => {
    expect(serverSymbols.length).toBeGreaterThanOrEqual(6)
  })

  it.each(serverSymbols)('%s is mapped client-side too', (symbol) => {
    expect(inviteErrorMessage(symbol)).not.toBe('Could not accept this invite. Please try again.')
    expect(inviteErrorMessage(symbol)).not.toBe(symbol)
  })
})
