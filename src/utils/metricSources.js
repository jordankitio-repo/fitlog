// Where a day's weight, steps or cardio came from, named on its row. Mirrors
// the source check constraint (20261015020000_device_metric_provenance), the
// same list on weight_log, steps_log and cardio_log. Shared by the client's
// Today and the coach's record so both name a device the same way.
export const METRIC_SOURCES = {
  manual: 'Logged by hand',
  apple_health: 'Apple Health',
  health_connect: 'Health Connect',
  withings: 'Withings',
  whoop: 'WHOOP',
  google_health: 'Google Health',
}

// The device's name, or null for a value typed in by hand (the default, so
// not worth a word).
export function sourceLabel(source) {
  return source && source !== 'manual' ? METRIC_SOURCES[source] ?? null : null
}
