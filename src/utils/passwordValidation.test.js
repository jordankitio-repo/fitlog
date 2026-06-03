import { describe, it, expect } from 'vitest'
import { getPasswordValidationError } from './passwordValidation'

describe('getPasswordValidationError', () => {
  it('returns empty string for a valid password', () => {
    expect(getPasswordValidationError('Abcdef1!')).toBe('')
  })

  it('rejects passwords shorter than 8 characters', () => {
    expect(getPasswordValidationError('Ab1!')).not.toBeNull()
  })

  it('rejects passwords with no uppercase', () => {
    expect(getPasswordValidationError('abcdef1!')).not.toBeNull()
  })

  it('rejects passwords with no lowercase', () => {
    expect(getPasswordValidationError('ABCDEF1!')).not.toBeNull()
  })

  it('rejects passwords with no digit', () => {
    expect(getPasswordValidationError('Abcdefg!')).not.toBeNull()
  })

  it('rejects passwords with no symbol', () => {
    expect(getPasswordValidationError('Abcdef12')).not.toBeNull()
  })

  it('accepts a long complex password', () => {
    expect(getPasswordValidationError('MyStr0ng!PassW0rd#2026')).toBe('')
  })
})
