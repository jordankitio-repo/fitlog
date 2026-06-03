import { describe, it, expect } from 'vitest'
import { getInviteBlockReason } from './inviteValidation'

describe('getInviteBlockReason', () => {

  describe('new user - no existing profile', () => {
    it('returns null for brand new email', () => {
      expect(getInviteBlockReason(null, null, null)).toBeNull()
    })
  })

  describe('coach account', () => {
    it('blocks a coach email', () => {
      const coach = { role: 'coach' }
      expect(getInviteBlockReason(coach, null, null)).toBe('coach')
    })
  })

  describe('existing client', () => {
    it('blocks when already your client', () => {
      const client = { role: 'client' }
      const relation = { id: 'some-id' }
      expect(getInviteBlockReason(client, relation, null)).toBe('already-your-client')
    })

    it('blocks when client of another coach', () => {
      const client = { role: 'client' }
      expect(getInviteBlockReason(client, null, null)).toBe('client-of-another')
    })
  })

  describe('duplicate pending invite', () => {
    it('blocks when pending invite already exists for solo user', () => {
      const solo = { role: 'solo' }
      const pending = { id: 'invite-id' }
      expect(getInviteBlockReason(solo, null, pending)).toBe('duplicate-pending')
    })
  })

  describe('existing solo user', () => {
    it('returns existing-solo to trigger confirmation prompt', () => {
      const solo = { role: 'solo' }
      expect(getInviteBlockReason(solo, null, null)).toBe('existing-solo')
    })
  })

  describe('unknown role edge case', () => {
    it('returns null for unrecognized role', () => {
      const unknown = { role: 'pending' }
      expect(getInviteBlockReason(unknown, null, null)).toBeNull()
    })
  })
})
