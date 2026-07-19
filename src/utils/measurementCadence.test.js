import { describe, it, expect } from 'vitest'
import { measurementCadenceDays, measurementStatus } from './measurementCadence'

const today = new Date('2026-07-18T12:00:00')
const daysAgo = (n) => {
  const d = new Date(today); d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

describe('measurementCadenceDays', () => {
  it('tightens to 2 weeks while cutting, else 4 weeks', () => {
    expect(measurementCadenceDays('down')).toBe(14)
    expect(measurementCadenceDays('up')).toBe(28)
    expect(measurementCadenceDays('maintain')).toBe(28)
    expect(measurementCadenceDays(null)).toBe(28)
    expect(measurementCadenceDays(undefined)).toBe(28)
  })
})

describe('measurementStatus', () => {
  it('reports no data when there is no prior measurement', () => {
    const r = measurementStatus({ lastMeasuredIso: null, cadenceDays: 14, today })
    expect(r.hasData).toBe(false)
    expect(r.due).toBe(false)
    expect(r.daysSince).toBeNull()
  })

  it('is fresh inside the cadence', () => {
    const r = measurementStatus({ lastMeasuredIso: daysAgo(9), cadenceDays: 14, today })
    expect(r.hasData).toBe(true)
    expect(r.daysSince).toBe(9)
    expect(r.due).toBe(false)
  })

  it('is due exactly at the cadence and beyond', () => {
    expect(measurementStatus({ lastMeasuredIso: daysAgo(14), cadenceDays: 14, today }).due).toBe(true)
    expect(measurementStatus({ lastMeasuredIso: daysAgo(30), cadenceDays: 14, today }).due).toBe(true)
  })

  it('a cutting client (14d) reads due where a steady client (28d) is still fresh', () => {
    const iso = daysAgo(20)
    expect(measurementStatus({ lastMeasuredIso: iso, cadenceDays: measurementCadenceDays('down'), today }).due).toBe(true)
    expect(measurementStatus({ lastMeasuredIso: iso, cadenceDays: measurementCadenceDays('maintain'), today }).due).toBe(false)
  })

  it('defaults to the steady cadence when none is passed', () => {
    const r = measurementStatus({ lastMeasuredIso: daysAgo(25), today })
    expect(r.cadenceDays).toBe(28)
    expect(r.due).toBe(false)
  })
})
