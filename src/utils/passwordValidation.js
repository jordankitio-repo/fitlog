export function getPasswordValidationError(password, { shortMessages = false } = {}) {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (!/[A-Z]/.test(password)) {
    return shortMessages
      ? 'Must contain at least one uppercase letter.'
      : 'Password must contain at least one uppercase letter.'
  }
  if (!/[a-z]/.test(password)) {
    return shortMessages
      ? 'Must contain at least one lowercase letter.'
      : 'Password must contain at least one lowercase letter.'
  }
  if (!/[0-9]/.test(password)) {
    return shortMessages
      ? 'Must contain at least one number.'
      : 'Password must contain at least one number.'
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return shortMessages
      ? 'Must contain at least one special character.'
      : 'Password must contain at least one special character.'
  }

  return ''
}
