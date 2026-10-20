import { describe, it, expect } from 'vitest'
import { cmToFtIn, ftInToCm, convertWeight } from './biometrics'

// Switching the unit toggle has to convert what is already entered. Three
// screens had their own toggle and none of them did: type 180 lb, switch to
// metric, and you were left holding "180 kg" with only the label to tell you.
// Nothing errors, the number is plausible, and the targets computed from it are
// for someone twice the size.
describe('convertWeight', () => {
  it('converts pounds to kilos and back', () => {
    expect(convertWeight('180', 'imperial', 'metric')).toBe('81.6')
    expect(convertWeight('81.6', 'metric', 'imperial')).toBe('179.9')
  })

  it('accepts the unit names as well as the system names', () => {
    expect(convertWeight('100', 'lbs', 'kg')).toBe('45.4')
    expect(convertWeight('45.4', 'kg', 'lbs')).toBe('100.1')
  })

  it('does nothing when the units have not changed', () => {
    expect(convertWeight('180', 'imperial', 'imperial')).toBe('180')
  })

  // An empty field is not a zero. Converting '' to '0' would put a weight of
  // zero into a box the reader never filled, and zero is a value the target
  // maths will happily accept.
  it('leaves an empty field empty', () => {
    expect(convertWeight('', 'imperial', 'metric')).toBe('')
    expect(convertWeight(null, 'imperial', 'metric')).toBe('')
    expect(convertWeight(undefined, 'imperial', 'metric')).toBe('')
  })

  it('leaves something unparseable alone rather than destroying it', () => {
    expect(convertWeight('abc', 'imperial', 'metric')).toBe('abc')
  })

  // These are text inputs; handing one a number makes it uncontrolled on the
  // next render.
  it('always returns a string', () => {
    expect(typeof convertWeight('180', 'imperial', 'metric')).toBe('string')
    expect(typeof convertWeight(180, 'imperial', 'metric')).toBe('string')
  })

  it('round-trips without drifting', () => {
    const there = convertWeight('200', 'imperial', 'metric')
    const back = Number(convertWeight(there, 'metric', 'imperial'))
    expect(Math.abs(back - 200)).toBeLessThan(0.2)
  })
})

describe('height conversion', () => {
  it('round-trips a height through both systems', () => {
    const { ft, in: inches } = cmToFtIn(180)
    expect(`${ft}'${inches}"`).toBe("5'11\"")
    expect(Math.abs(ftInToCm(ft, inches) - 180)).toBeLessThan(1.5)
  })

  it('gives empty fields for no height, rather than 0 ft 0 in', () => {
    expect(cmToFtIn('')).toEqual({ ft: '', in: '' })
    expect(cmToFtIn(0)).toEqual({ ft: '', in: '' })
  })
})
