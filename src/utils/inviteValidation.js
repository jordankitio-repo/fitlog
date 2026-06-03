export function getInviteBlockReason(existingProfile, existingRelation, pendingInvite) {
  if (!existingProfile) return null
  if (existingProfile.role === 'coach') return 'coach'
  if (existingProfile.role === 'client') {
    if (existingRelation) return 'already-your-client'
    return 'client-of-another'
  }
  if (pendingInvite) return 'duplicate-pending'
  if (existingProfile.role === 'solo') return 'existing-solo'
  return null
}
