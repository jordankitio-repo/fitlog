import { registerPlugin } from '@capacitor/core'
import { supabase } from '../supabase'
import { isNativeApp } from './platform'
import { addDays, parseLocalDateString, toLocalDateString } from './dateHelpers'

// Apple Health -> Gardnr. The phone reads (ios/App/App/HealthPlugin.swift) and
// the `device-sync` edge function writes; this file is the walk between them.
//
// Nothing here decides what a row is allowed to overwrite. The manual-edit pin,
// dedupe and tombstones all live in apply_device_metrics, so this layer can be
// re-run, interrupted or run twice at once without being able to do harm. It
// still avoids running twice at once, but for cost, not correctness.

const Health = registerPlugin('Health')

export const APPLE_HEALTH = 'apple_health'

// Recorded against both consents. It is the Consumer Health Data policy's
// "Last updated" date, because that page is what the client is agreeing to:
// bump the two together.
export const HEALTH_POLICY_VERSION = '2026-10-26'

// Fired on window after a sync wrote anything, so an open Log can re-read.
export const DEVICE_SYNC_EVENT = 'gardnr:device-synced'

// One year on first connect. A coach taking on a client gets their history,
// not a blank chart, and a year sits inside the function's 400-day steps cap.
const BACKFILL_DAYS = 365
// Re-read the last two days on every sync: a Watch can hand its steps to the
// phone hours late, and the window is idempotent, so overlap costs nothing.
const OVERLAP_DAYS = 2
// One request per 90 days keeps each payload well inside the function's caps
// and makes a backfill resumable: each chunk advances the watermark, so a
// killed app picks up where it stopped instead of starting the year again.
const CHUNK_DAYS = 90
// Coming back to the app syncs, so a workout logged in Health or Fitness a
// moment ago is there on return. This only stops a burst of app switches
// from being a burst of syncs; it was ten minutes, which meant a client who
// logged something in Health and came straight back saw nothing new.
const MIN_INTERVAL_MS = 30 * 1000

const KG_TO_LBS = 2.20462

// The date windows a sync reads, oldest first. Pure, so it is tested rather
// than trusted.
//
// `watermark` is how far the data is believed COMPLETE, which is never today:
// today is still being walked. It is the chunk's last day, or yesterday for the
// chunk that reaches today.
export function syncWindows(syncedThrough, today) {
  const todayDate = parseLocalDateString(today)
  const yesterday = toLocalDateString(addDays(todayDate, -1))
  const first = syncedThrough
    ? addDays(parseLocalDateString(syncedThrough), -OVERLAP_DAYS)
    : addDays(todayDate, -(BACKFILL_DAYS - 1))
  // A watermark from the future (a phone whose clock was wrong) must not
  // leave nothing to read.
  let cursor = first > todayDate ? addDays(todayDate, -OVERLAP_DAYS) : first

  const windows = []
  while (toLocalDateString(cursor) <= today) {
    const endDate = addDays(cursor, CHUNK_DAYS - 1)
    const end = toLocalDateString(endDate) < today ? toLocalDateString(endDate) : today
    windows.push({
      start: toLocalDateString(cursor),
      end,
      watermark: end === today ? yesterday : end,
    })
    cursor = addDays(parseLocalDateString(end), 1)
  }
  return windows
}

// The plugin reports weight in kg; the row is stored in the unit the client
// already uses, so a lbs user's chart does not fill with kilograms.
export function toSyncPayload(raw, unit) {
  return {
    steps: raw?.steps ?? [],
    workouts: raw?.workouts ?? [],
    weights: (raw?.weights ?? []).map(w => ({
      logged_date: w.logged_date,
      weighed_at: w.weighed_at,
      weight: unit === 'kg' ? w.weight_kg : Math.round(w.weight_kg * KG_TO_LBS * 10) / 10,
      unit,
      external_id: w.external_id,
    })),
  }
}

// The function answers a refusal with a JSON body. supabase-js turns any
// non-2xx into an error whose body is still unread on `context`.
async function callDeviceSync(body) {
  const { data, error } = await supabase.functions.invoke('device-sync', { body })
  if (!error) return data
  let code = 'request_failed'
  try { code = (await error.context.json())?.error || code } catch { /* not JSON */ }
  const err = new Error(code)
  err.code = code
  throw err
}

export async function appleHealthAvailable() {
  if (!isNativeApp()) return false
  try {
    const { available } = await Health.isAvailable()
    return Boolean(available)
  } catch {
    return false
  }
}

// The live Apple Health connection, or null. Readable by its owner under RLS.
export async function fetchAppleHealthConnection(userId) {
  const { data, error } = await supabase
    .from('device_connections')
    .select('id, status, connected_at, last_synced_at, synced_through, backfill_pending, last_error_code')
    .eq('user_id', userId)
    .eq('provider', APPLE_HEALTH)
    .neq('status', 'disconnected')
    .maybeSingle()
  if (error) throw error
  return data
}

// The unit the client already logs in: their latest weigh-in, else their goal.
async function preferredWeightUnit(userId) {
  const { data: last } = await supabase
    .from('weight_log').select('unit').eq('user_id', userId)
    .order('logged_date', { ascending: false }).limit(1).maybeSingle()
  if (last?.unit) return last.unit
  const { data: t } = await supabase
    .from('targets').select('weight_goal_unit').eq('user_id', userId).maybeSingle()
  return t?.weight_goal_unit === 'kg' ? 'kg' : 'lbs'
}

// The two consent sentences, exactly as the checkboxes show them. One source:
// the settings screen renders these and connect records them, so the stored
// consent can never differ from what the client read and ticked.
export const CONSENT_TEXT = {
  collect: 'Allow Gardnr to read my steps, weight, workouts, height, sex and date of birth from Apple Health.',
  shareCoach: 'Share this data with my coach, including any coach I work with later.',
}

// Shows Apple's permission sheet, records both consents, opens the connection.
// The client has already ticked both consents in our UI; this is the call that
// makes them a record.
export async function connectAppleHealth() {
  await Health.requestAuthorization()
  return callDeviceSync({
    action: 'connect',
    provider: APPLE_HEALTH,
    consentCollect: true,
    consentShareCoach: true,
    consentTexts: CONSENT_TEXT,
    policyVersion: HEALTH_POLICY_VERSION,
    deviceLabel: 'iPhone',
  })
}

// What Health knows about the client, to fill in onboarding: { sex,
// birthDate, heightCm, weightKg, weightDate }, each present only if Health has
// it and the client allowed it. Never throws: a profile it cannot read is an
// empty one, and the form is still there to type into.
export async function readHealthProfile() {
  if (!isNativeApp()) return {}
  try {
    return await Health.readProfile()
  } catch (err) {
    console.error('Apple Health profile read failed:', err)
    return {}
  }
}

export async function disconnectAppleHealth({ purge }) {
  return callDeviceSync({ action: 'disconnect', provider: APPLE_HEALTH, purge: Boolean(purge) })
}

let inFlight = null
let lastRunAt = 0

// Reads everything since the watermark and hands it over, chunk by chunk.
// Resolves to the totals written, or null when there was nothing to do (not
// native, not connected, ran a moment ago). `force` skips the interval, for
// the Sync now button.
export function syncAppleHealth(userId, { force = false } = {}) {
  if (!userId || !isNativeApp()) return Promise.resolve(null)
  if (inFlight) return inFlight
  if (!force && Date.now() - lastRunAt < MIN_INTERVAL_MS) return Promise.resolve(null)

  inFlight = (async () => {
    const connection = await fetchAppleHealthConnection(userId)
    if (!connection) return null
    lastRunAt = Date.now()

    const unit = await preferredWeightUnit(userId)
    const totals = { steps: 0, weights: 0, workouts: 0 }
    for (const w of syncWindows(connection.synced_through, toLocalDateString(new Date()))) {
      const raw = await Health.read({ startDate: w.start, endDate: w.end })
      const res = await callDeviceSync({
        action: 'sync',
        provider: APPLE_HEALTH,
        syncedThrough: w.watermark,
        ...toSyncPayload(raw, unit),
      })
      totals.steps += res?.steps ?? 0
      totals.weights += res?.weights ?? 0
      totals.workouts += res?.workouts ?? 0
    }
    if (totals.steps || totals.weights || totals.workouts) {
      window.dispatchEvent(new CustomEvent(DEVICE_SYNC_EVENT, { detail: totals }))
    }
    return totals
  })().finally(() => { inFlight = null })

  return inFlight
}

// --- Tombstones ------------------------------------------------------------
//
// A deleted synced row must not come back on the next sync. That includes a
// synced row the client EDITED first: the edit flips `source` to 'manual' but
// keeps external_id and the connection, so the row is still the device's
// record, and deleting it would otherwise let the next sync re-insert it.
// The test is therefore "came from a connection", not "source is a device".

const METRIC_FOR_TABLE = { steps_log: 'steps', weight_log: 'weight', cardio_log: 'cardio' }

export function deviceDedupeKey(table, row) {
  const metric = METRIC_FOR_TABLE[table]
  if (!metric || !row?.source_connection_id) return null
  const key = metric === 'steps' ? row.logged_date : row.external_id
  return key ? { metric, key } : null
}

async function setDismissed(action, table, rows) {
  const marks = rows.map(r => ({ row: r, mark: deviceDedupeKey(table, r) })).filter(m => m.mark)
  if (!marks.length) return
  // The provider is the connection's, looked up rather than read off `source`,
  // which says 'manual' on exactly the edited rows this exists for.
  const ids = [...new Set(marks.map(m => m.row.source_connection_id))]
  const { data: conns, error } = await supabase
    .from('device_connections').select('id, provider').in('id', ids)
  if (error) throw error
  const providerOf = Object.fromEntries((conns ?? []).map(c => [c.id, c.provider]))
  for (const { row, mark } of marks) {
    const provider = providerOf[row.source_connection_id]
    if (!provider) continue
    await callDeviceSync({ action, provider, metric: mark.metric, dedupeKey: mark.key })
  }
}

export const dismissDeviceRows = (table, rows) => setDismissed('dismiss', table, rows)
export const undismissDeviceRows = (table, rows) => setDismissed('undismiss', table, rows)

// --- Typed weigh-ins, written to Apple Health ------------------------------
//
// The one thing Gardnr writes. A weigh-in typed here goes to Health so the
// client's weight history is whole there too; everything else stays read-only
// (steps and workouts were recorded by the phone or Watch, and a second copy
// would be counted twice). A reading that CAME from Health -- a scale -- is
// never written back: it is already there.
//
// Every write is best-effort and after the fact. The weigh-in is saved in
// Gardnr first; Health failing, being disconnected, or having writing turned
// off leaves the log exactly as the client entered it.

// Typed into Gardnr, not read from a device. A synced reading the client then
// edited still has its connection and record id, so it is the device's, and
// writing the edit would put a second weigh-in in Health beside the original.
export function isTypedWeighIn(row) {
  return Boolean(row) && !row.source_connection_id && !row.external_id
}

// The client's own switch for writing ("Save weigh-ins to Apple Health").
// Kept on the device, not the account, because that is where the permission it
// sits on top of lives: iOS grants Health access per device, and a client with
// two phones is asked on each. Storage can throw (private mode, cleared site
// data); it then reads as on, which is the default.
const SAVE_WEIGH_INS_KEY = 'gardnr-health-save-weigh-ins'

export function savesWeighInsToHealth() {
  try { return localStorage.getItem(SAVE_WEIGH_INS_KEY) !== 'off' } catch { return true }
}

export function setSavesWeighInsToHealth(on) {
  try { localStorage.setItem(SAVE_WEIGH_INS_KEY, on ? 'on' : 'off') } catch { /* stays on */ }
}

// 'allowed' | 'off' (turned off for Gardnr in iOS) | 'notAsked', or null off
// the native app.
export async function healthWriteStatus() {
  if (!isNativeApp()) return null
  try { return (await Health.writeStatus()).status ?? null } catch { return null }
}

export async function writeWeighInToHealth(row) {
  if (!isNativeApp() || !isTypedWeighIn(row) || !row.user_id) return null
  if (!savesWeighInsToHealth()) return null
  // Only for a client who connected Apple Health. Writing is part of that
  // connection, and nobody else has been asked.
  if (!(await fetchAppleHealthConnection(row.user_id))) return null
  const kg = row.unit === 'kg' ? Number(row.weight) : Number(row.weight) / KG_TO_LBS
  const { id } = await Health.saveWeight({
    kg: Math.round(kg * 100) / 100,
    date: row.logged_date,
    time: row.weighed_at || undefined,
  })
  if (!id) return null // writing not allowed; nothing to remember
  const { error } = await supabase.from('weight_log').update({ health_sample_id: id }).eq('id', row.id)
  if (error) throw error
  return id
}

// Removes the sample a typed weigh-in was written to. HealthKit only lets an
// app delete its own samples, so this cannot touch a scale's data even if it
// were handed one.
export async function removeWeighInFromHealth(row) {
  if (!isNativeApp() || !row?.health_sample_id) return
  await Health.deleteSample({ id: row.health_sample_id })
}

// An edit replaces the sample rather than changing it: HealthKit samples are
// immutable, and delete-then-save is how its own apps edit one. With the switch
// off, Health is left exactly as it is: removing the old sample would still be
// Gardnr changing Health, which is what the client turned off.
export async function rewriteWeighInInHealth(before, after) {
  if (!savesWeighInsToHealth()) return null
  await removeWeighInFromHealth(before)
  return writeWeighInToHealth({ ...after, health_sample_id: null })
}
