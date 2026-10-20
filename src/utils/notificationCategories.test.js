import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { EMAIL_CATEGORIES, categoriesForRole, isEnabled } from './notificationCategories'

const MIGRATION = 'supabase/migrations/20261019100000_notification_preferences.sql'
const SENDER_TYPES = 'supabase/functions/_shared/notifications.ts'

describe('notification categories', () => {
  // The keys live in three files: this list, the DB check constraint, and the
  // sender-side union type. A key added to one and forgotten in another is the
  // failure this guards, and it is silent in both directions — a screen toggle
  // that writes a key no sender reads mutes nothing, and a sender reading a key
  // the constraint rejects makes the screen unsaveable.
  it('matches the keys the database will actually store', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    const constraint = sql.match(/email - array\[([^\]]+)\]/)
    expect(constraint, 'could not find the known-categories constraint').not.toBeNull()
    const sqlKeys = [...constraint[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
    expect(EMAIL_CATEGORIES.map((c) => c.key).sort()).toEqual(sqlKeys)
  })

  it('matches the categories the senders can pass', () => {
    const ts = readFileSync(SENDER_TYPES, 'utf8')
    const union = ts.match(/export type EmailCategory =([\s\S]*?)\n\n/)
    expect(union, 'could not find the EmailCategory union').not.toBeNull()
    const tsKeys = [...union[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
    expect(EMAIL_CATEGORIES.map((c) => c.key).sort()).toEqual(tsKeys)
  })

  it('gives every category a role that some screen renders', () => {
    for (const c of EMAIL_CATEGORIES) expect(['coach', 'client']).toContain(c.role)
    expect(categoriesForRole('coach').length).toBeGreaterThan(0)
    expect(categoriesForRole('client').length).toBeGreaterThan(0)
    // Solo has no coach on either end of any of these, so the panel is hidden
    // rather than empty.
    expect(categoriesForRole('solo')).toEqual([])
  })

  // Absent means SEND. A user who has never opened the screen has no row, and
  // every toggle must still read as on.
  it('defaults to on for an absent key, an absent map, and null', () => {
    expect(isEnabled({}, 'report')).toBe(true)
    expect(isEnabled(undefined, 'report')).toBe(true)
    expect(isEnabled(null, 'report')).toBe(true)
    expect(isEnabled({ nudge: false }, 'report')).toBe(true)
  })

  it('is off only for an explicit false', () => {
    expect(isEnabled({ report: false }, 'report')).toBe(false)
    expect(isEnabled({ report: true }, 'report')).toBe(true)
  })
})
